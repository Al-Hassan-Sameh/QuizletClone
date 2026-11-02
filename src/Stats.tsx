import { CheckCircle2, Target, Flame, Clock } from "lucide-react";
import {
  type StudySet,
  type Session,
  type ReviewEvent,
  streak,
} from "./domain";
import { Metric } from "./components";
import { MathText } from "./MathText";
export function Stats({
  sets,
  sessions,
  reviews,
}: {
  sets: StudySet[];
  sessions: Session[];
  reviews: ReviewEvent[];
}) {
  const cards = sets.flatMap((s) => s.cards);
  const tests = sessions.filter((s) => s.mode === "Test");
  const total = tests.reduce((a, s) => a + s.total, 0);
  const accuracy = total
    ? Math.round((tests.reduce((a, s) => a + s.correct, 0) / total) * 100)
    : 0;
  const known = cards.filter((c) => c.status === "known").length;
  const learning = cards.filter((c) => c.status === "learning").length;
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - 13 + i);
    return {
      date,
      count: reviews.filter(
        (r) => new Date(r.date).toDateString() === date.toDateString(),
      ).length,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <>
      <div className="metrics">
        <Metric
          icon={<CheckCircle2 />}
          label="Sessions completed"
          value={sessions.length}
          foot="Every session adds up"
          color="purple"
        />
        <Metric
          icon={<Target />}
          label="Test accuracy"
          value={`${accuracy}%`}
          foot={
            tests.length
              ? `${tests.length} practice tests`
              : "Complete a test to begin"
          }
          color="blue"
        />
        <Metric
          icon={<Flame />}
          label="Current streak"
          value={`${streak(sessions)} days`}
          foot="Keep your momentum"
          color="orange"
        />
        <Metric
          icon={<Clock />}
          label="Due for review"
          value={cards.filter((c) => c.due <= Date.now()).length}
          foot="Ready for a fresh look"
          color="green"
        />
      </div>
      <div className="stats-grid">
        <section className="panel">
          <h2>A little learning, every day</h2>
          <p>Cards reviewed over the last two weeks</p>
          <div
            className="activity-chart"
            role="img"
            aria-label={days
              .map((d) => `${d.date.toLocaleDateString()}: ${d.count} cards`)
              .join("; ")}
          >
            {days.map((d) => (
              <div className="chart-column" key={d.date.toDateString()}>
                <span className="chart-value">{d.count || ""}</span>
                <div
                  className="chart-bar"
                  style={{ height: `${Math.max(3, (d.count / max) * 130)}px` }}
                  title={`${d.date.toLocaleDateString()}: ${d.count} reviews`}
                />
                <small>{d.date.getDate()}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Your collection, growing</h2>
          <p>
            {sets.length} sets · {cards.length} flashcards
          </p>
          {[
            { label: "Mastered", value: known, color: "#48a98a" },
            { label: "Still learning", value: learning, color: "#e6a65c" },
            {
              label: "Not studied yet",
              value: cards.length - known - learning,
              color: "#aaa2e9",
            },
          ].map((r) => (
            <div className="status-stat" key={r.label}>
              <div>
                <span>{r.label}</span>
                <strong>{r.value}</strong>
              </div>
              <div className="progress-track">
                <span
                  style={{
                    width: `${cards.length ? (r.value / cards.length) * 100 : 0}%`,
                    background: r.color,
                  }}
                />
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="panel history">
        <h2>Your study history</h2>
        <p>Real effort. Saved right here.</p>
        {sessions.length ? (
          <div className="history-scroll">
            <table>
              <thead>
                <tr>
                  <th>Study set</th>
                  <th>Mode</th>
                  <th>Result</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>
                      <span className="pill">{s.mode}</span>
                    </td>
                    <td>
                      {s.correct} / {s.total}
                    </td>
                    <td>{new Date(s.date).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty compact">
            <Clock size={26} />
            <p>Your first session will appear here. Let’s make a start.</p>
          </div>
        )}
      </section>
      <section className="panel history">
        <h2>Card review history</h2>
        <p>Every recall and its next review interval.</p>
        {reviews.length ? (
          <div className="history-scroll">
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Result</th>
                  <th>Next interval</th>
                  <th>Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <MathText text={r.term} />
                    </td>
                    <td>{r.known ? "Known" : "Still learning"}</td>
                    <td>{r.interval} days</td>
                    <td>{new Date(r.date).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Your card reviews will appear here.</p>
        )}
      </section>
    </>
  );
}
