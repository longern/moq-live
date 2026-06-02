import { useEffect } from "react";

export function WatchTestCanvas({ playback, playerRef, playerSession }) {
  useEffect(() => {
    const canvas = playerRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    let frameId = 0;
    const { width, height, orientation, label } = playback;
    const startedAt = performance.now();

    const draw = (now) => {
      const elapsed = (now - startedAt) / 1000;
      const sweep = (elapsed * 90) % (width + 220);
      const pulse = (Math.sin(elapsed * 2.4) + 1) / 2;

      context.clearRect(0, 0, width, height);
      const background = context.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, "#06121d");
      background.addColorStop(0.44, orientation === "portrait" ? "#14283f" : "#102c32");
      background.addColorStop(1, "#10121f");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalAlpha = 0.28;
      context.strokeStyle = "#86f7df";
      context.lineWidth = 2;
      const grid = orientation === "portrait" ? 80 : 96;
      for (let x = -grid; x < width + grid; x += grid) {
        context.beginPath();
        context.moveTo(x + sweep * 0.16, 0);
        context.lineTo(x - height * 0.22 + sweep * 0.16, height);
        context.stroke();
      }
      context.restore();

      const blockWidth = orientation === "portrait" ? width * 0.78 : width * 0.48;
      const blockHeight = orientation === "portrait" ? height * 0.16 : height * 0.22;
      const blockX = (width - blockWidth) / 2;
      const blockY = height * (orientation === "portrait" ? 0.42 : 0.36);
      context.fillStyle = "rgba(255, 255, 255, 0.09)";
      context.fillRect(blockX, blockY, blockWidth, blockHeight);
      context.strokeStyle = "rgba(255, 255, 255, 0.32)";
      context.lineWidth = 3;
      context.strokeRect(blockX, blockY, blockWidth, blockHeight);

      context.beginPath();
      context.arc(width * 0.22, height * 0.28, 46 + pulse * 36, 0, Math.PI * 2);
      context.fillStyle = "rgba(16, 196, 182, 0.42)";
      context.fill();
      context.beginPath();
      context.arc(width * 0.78, height * 0.68, 58 + (1 - pulse) * 42, 0, Math.PI * 2);
      context.fillStyle = "rgba(255, 114, 64, 0.36)";
      context.fill();

      context.fillStyle = "#edf8ff";
      context.font = `${Math.round(width * 0.045)}px system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, width / 2, blockY + blockHeight * 0.42);
      context.fillStyle = "rgba(237, 248, 255, 0.72)";
      context.font = `${Math.round(width * 0.022)}px system-ui, sans-serif`;
      context.fillText(`${width} x ${height} local test video`, width / 2, blockY + blockHeight * 0.66);

      context.fillStyle = "rgba(237, 248, 255, 0.7)";
      context.font = `${Math.round(width * 0.018)}px ui-monospace, monospace`;
      context.textAlign = "left";
      context.fillText(`t=${elapsed.toFixed(1)}s`, 28, height - 32);

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [playback, playerRef]);

  return (
    <canvas
      ref={playerRef}
      className="player-moq"
      width={playback.width}
      height={playback.height}
      aria-label={`${playerSession.namespace} 测试视频`}
    />
  );
}
