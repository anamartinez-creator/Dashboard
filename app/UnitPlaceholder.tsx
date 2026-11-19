export default function UnitPlaceholder({ title, blurb }: { title: string; blurb: string }) {
  return (
    <>
      <div className="hero">
        <div className="hero-in">
          <div className="hero-bar">
            <h1 className="hero-title">{title}</h1>
          </div>
          <div className="brief is-ok">
            <div className="brief-main">
              <p className="brief-eyebrow">Coming soon</p>
              <h2 className="brief-title">{blurb}</h2>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
