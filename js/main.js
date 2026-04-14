(() => {
  const { app } = window.SurvivorCore;
  const { buildSetupEditors, bindSetupEvents, getSetupData, renderSetupDiagnostics, setSetupStep } = window.SurvivorSetup;
  const { bindGameEvents, initGame } = window.SurvivorGameplay;

  function handleStartGame() {
    const setup = getSetupData();
    const report = renderSetupDiagnostics(setup);
    if (report.blockers.length) {
      const details = report.blockers.map((issue, idx) => `${idx + 1}. ${issue.text}`).join("\n");
      alert(`La simulation ne peut pas se lancer.\n\n${details}`);
      if (typeof report.blockers[0].step === "number") {
        setSetupStep(report.blockers[0].step);
      }
      return;
    }
    initGame(setup);
  }

  function bindStartAction() {
    window.SurvivorCore.el.startGame.addEventListener("click", handleStartGame);
  }

  function bootstrap() {
    buildSetupEditors();
    bindSetupEvents();
    bindGameEvents();
    bindStartAction();
    app.setupStepIndex = 0;
  }

  bootstrap();
})();
