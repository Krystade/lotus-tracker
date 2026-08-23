import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Keeps a render error from blanking the app.
 *
 * React 18 unmounts the whole tree on an uncaught render error, so without
 * this a single bad value shows a white screen with no way back. That is worse
 * here than in most apps: the thing on screen is a live game four people are
 * playing, and the only fix for a bad persisted value used to be clearing
 * storage from developer tools -- which nobody is doing at a table.
 *
 * So: say what happened, and offer the two ways out in order of how much they
 * cost. Reloading is free and fixes anything transient. Clearing saved data is
 * destructive and is spelled out as such.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Left in production on purpose: if this ever fires on someone's phone,
    // the console is the only record of why.
    console.error("Lotus Tracker crashed while rendering:", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash" role="alert">
        <h1 className="crash__title">Something broke</h1>
        <p className="crash__body">
          The tracker hit an error and stopped drawing. Your game is still
          saved — reloading usually brings it back.
        </p>
        <button
          className="crash__btn crash__btn--primary"
          onClick={() => location.reload()}
        >
          Reload
        </button>
        <button
          className="crash__btn"
          onClick={() => {
            // Only if reloading did not help: the saved state is the thing at
            // fault. Destructive, so it says so on the button.
            try {
              localStorage.removeItem("lotus-tracker");
            } catch {
              /* storage unavailable; reloading is all that is left */
            }
            location.reload();
          }}
        >
          Clear saved data and restart
        </button>
        <pre className="crash__detail">{String(error?.message ?? error)}</pre>
      </div>
    );
  }
}
