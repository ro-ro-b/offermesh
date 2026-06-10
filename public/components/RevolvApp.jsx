// Revolv — app entry, extracted from the supplied HTML so JSX can be precompiled.

function DualMark({ size = 24, color = "#2094A2", style }) {
  return (
    <svg width={size} height={(size * 30) / 34} viewBox="0 0 34 30" fill="none"
      xmlns="http://www.w3.org/2000/svg" style={style} aria-hidden="true">
      <path d="M23.1828 20.8003C28.9236 20.8003 33.5788 16.1433 33.5788 10.4002C33.5788 4.657 28.9236 0 23.1828 0H12.7866V1.64966C16.2657 2.05843 18.9654 5.01906 18.9654 8.60744V20.8003H23.1828Z" fill={color}></path>
      <path d="M10.3961 8.87939C4.65518 8.87939 0 13.5364 0 19.2796C0 25.0227 4.65518 29.6798 10.3961 29.6798H20.7922V28.0301C17.3131 27.6213 14.6135 24.6606 14.6135 21.0723V8.87939H10.3961Z" fill={color}></path>
    </svg>
  );
}
window.DualMark = DualMark;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "heroOrbit": false,
  "postureChips": false,
  "demoSpeed": 1.6
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = React.useState("demo");

  const jump = (section, consoleTab) => {
    if (consoleTab) setTab(consoleTab);
    const ids = { loop: "rv-loop", story: "rv-story", console: "rv-console" };
    const el = document.getElementById(ids[section]);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div id="top">
      <RvNav onJump={jump} />
      <div style={{ marginTop: -72 }}>
        <RvHero showOrbit={t.heroOrbit} onJump={jump} hideChips={!t.postureChips} />
      </div>
      <RvLifecycle />
      <RvStory />
      <RvConsole tab={tab} setTab={setTab} demoSpeed={t.demoSpeed} />
      <RvFooter />
      <TweaksPanel>
        <TweakSection label="Hero" />
        <TweakToggle label="Orbit illustration" value={t.heroOrbit} onChange={(v) => setTweak("heroOrbit", v)} />
        <TweakToggle label="Posture chips" value={t.postureChips} onChange={(v) => setTweak("postureChips", v)} />
        <TweakSection label="Console" />
        <TweakSlider label="Demo speed" value={t.demoSpeed} min={0.5} max={4} step={0.1} unit="×" onChange={(v) => setTweak("demoSpeed", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
