(function () {
  function create(seconds, onTick, onFinish) {
    let remaining = Math.max(0, Math.floor(seconds));
    let interval = null;
    let finished = false;

    const emit = () => onTick(Math.max(0, remaining));
    const stop = () => {
      if (interval !== null) window.clearInterval(interval);
      interval = null;
    };
    const tick = () => {
      if (finished) return;
      remaining = Math.max(0, remaining - 1);
      emit();
      if (remaining === 0) {
        finished = true;
        stop();
        onFinish();
      }
    };

    return {
      start() {
        if (interval !== null || finished) return;
        emit();
        interval = window.setInterval(tick, 1000);
      },
      stop,
      getRemaining: () => remaining,
      setRemaining(value) { remaining = Math.max(0, Math.floor(value)); emit(); }
    };
  }

  window.NetSecureTimer = { create };
})();
