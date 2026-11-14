import { useEffect, useRef, useState } from "react";
import { Lightbulb } from "lucide-react";

interface KeepAwakeControlProps {
  onChargingChange?: (charging: boolean) => void;
  onToast?: (msg: string) => void;
}

export function KeepAwakeControl({
  onChargingChange,
  onToast,
}: KeepAwakeControlProps) {
  const [keepAwake, setKeepAwake] = useState(false);
  const [isCharging, setIsCharging] = useState(false);
  const [batterySupported, setBatterySupported] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const isHttpsMode =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    window.location.protocol === "https:";

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const keepAwakeRef = useRef(false);
  const userToggledOffRef = useRef(false);
  keepAwakeRef.current = keepAwake;

  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        if (wakeLockRef.current && !wakeLockRef.current.released) {
          return;
        }
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // Ignore wake lock failure (e.g. non-HTTPS context or low battery)
    }
  };

  const stopMediaKeepAwake = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (oscRef.current) {
      try {
        oscRef.current.stop();
        oscRef.current.disconnect();
      } catch {
        // Ignore already stopped oscillator
      }
      oscRef.current = null;
    }
  };

  const startMediaKeepAwake = async (): Promise<boolean> => {
    stopMediaKeepAwake();
    let started = false;

    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      const ctx2d = canvas.getContext("2d");
      let tick = 0;
      const drawFrame = () => {
        if (!ctx2d) return;
        tick = (tick + 1) % 2;
        ctx2d.fillStyle = tick === 0 ? "#000000" : "#010101";
        ctx2d.fillRect(0, 0, 2, 2);
      };
      drawFrame();

      const canvasWithStream = canvas as HTMLCanvasElement & {
        captureStream?: (frameRate?: number) => MediaStream;
      };
      if (video && typeof canvasWithStream.captureStream === "function") {
        const stream = canvasWithStream.captureStream(1);
        streamRef.current = stream;
        timerRef.current = window.setInterval(drawFrame, 1000);
        video.srcObject = stream;
        await video.play();
        started = true;
      }
    } catch {
      // Video playback may fail if blocked by browser policy
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.frequency.value = 20;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        oscRef.current = osc;
        started = true;
      }
    } catch {
      // Ignore audio keep-awake errors
    }

    return started;
  };

  useEffect(() => {
    requestWakeLock();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };
    const onFirstGesture = () => {
      requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerdown", onFirstGesture, { passive: true });

    let batteryCleanup: (() => void) | undefined;
    const navWithBattery = navigator as Navigator & {
      getBattery?: () => Promise<{
        charging: boolean;
        addEventListener: (ev: string, cb: () => void) => void;
        removeEventListener: (ev: string, cb: () => void) => void;
      }>;
    };
    if (navWithBattery.getBattery) {
      navWithBattery
        .getBattery()
        .then((bat) => {
          setBatterySupported(true);
          const updateCharging = () => {
            setIsCharging(bat.charging);
            onChargingChange?.(bat.charging);
            if (!bat.charging && keepAwakeRef.current) {
              stopMediaKeepAwake();
              wakeLockRef.current?.release();
              wakeLockRef.current = null;
              setKeepAwake(false);
              onToast?.("检测到已断开充电，已自动关闭屏幕常亮");
            } else if (
              isHttpsMode &&
              bat.charging &&
              !keepAwakeRef.current &&
              !userToggledOffRef.current
            ) {
              requestWakeLock();
              setKeepAwake(true);
            }
            if (bat.charging && keepAwakeRef.current && document.visibilityState === "visible") {
              requestWakeLock();
            }
          };
          updateCharging();
          bat.addEventListener("chargingchange", updateCharging);
          batteryCleanup = () =>
            bat.removeEventListener("chargingchange", updateCharging);
        })
        .catch(() => {});
    }

    const keepAliveTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    }, 20000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onFirstGesture);
      clearInterval(keepAliveTimer);
      batteryCleanup?.();
      wakeLockRef.current?.release();
      stopMediaKeepAwake();
    };
  }, []);

  const handleToggle = async () => {
    if (keepAwake) {
      userToggledOffRef.current = true;
      stopMediaKeepAwake();
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
      setKeepAwake(false);
      onToast?.("已关闭屏幕常亮");
      return;
    }

    if (isHttpsMode) {
      if (!isCharging) {
        onToast?.(
          batterySupported
            ? "当前未在充电中，仅支持充电时开启屏幕常亮"
            : "当前浏览器无法确认充电状态，暂不支持开启屏幕常亮"
        );
        return;
      }
      userToggledOffRef.current = false;
      await requestWakeLock();
      setKeepAwake(true);
      onToast?.("已开启原生屏幕常亮（WakeLock）");
      return;
    }

    setShowModal(true);
  };

  const handleConfirmEnable = async () => {
    if (!isCharging) return;
    setShowModal(false);
    await requestWakeLock();
    const ok = await startMediaKeepAwake();
    setKeepAwake(true);
    onToast?.(ok ? "已开启屏幕常亮（视频防休眠）" : "已尝试开启屏幕常亮");
  };

  return (
    <>
      <button
        className={`icon-btn ${keepAwake ? "active" : ""}`}
        onClick={handleToggle}
        title={
          keepAwake
            ? "关闭屏幕常亮"
            : isHttpsMode
              ? "开启原生屏幕常亮（仅充电时可用）"
              : "开启屏幕常亮（视频防休眠）"
        }
      >
        <Lightbulb size={15} />
      </button>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            {isCharging ? (
              <>
                <h3 className="modal-title">开启屏幕常亮提醒</h3>
                <p className="modal-desc">
                  该功能将通过循环播放隐藏视频与极微弱静音音频来阻止屏幕熄灭，可能会增加耗电与轻微发热，并可能影响手机后台正在播放的其他媒体。断开充电后将自动关闭。
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowModal(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleConfirmEnable}
                  >
                    确认开启
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="modal-title">仅支持充电时开启</h3>
                <p className="modal-desc">
                  {batterySupported
                    ? "当前设备未在充电中。为防止过度耗电与设备发热，请先接通电源后再开启屏幕常亮。"
                    : "当前浏览器不支持读取电池充电状态（如部分 iOS 浏览器），无法确认是否正在充电，因此暂不允许开启该功能。"}
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowModal(false)}
                  >
                    知道了
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        playsInline
        muted
        loop
        aria-hidden="true"
        style={{
          position: "fixed",
          width: "2px",
          height: "2px",
          opacity: 0.001,
          pointerEvents: "none",
          bottom: 0,
          right: 0,
        }}
      />
    </>
  );
}
