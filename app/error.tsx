"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="wrap">
      <h1>Software Service Delivery Dashboard</h1>
      <div className="error">
        <strong>Notion is temporarily unavailable.</strong>
        <p>This usually clears in a minute. Your tracker data is safe.</p>
        <p><button type="button" onClick={() => reset()}>Try again</button></p>
      </div>
    </main>
  );
}
