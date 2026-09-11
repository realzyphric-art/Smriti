import { Component, type ErrorInfo, type ReactNode } from 'react';
import { errorLogger } from '@/services/errorLogger';
import { Button } from './Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Keeps a rendering failure from leaving the app on a blank screen. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    void errorLogger.captureException(error, {
      feature: 'react',
      eventType: 'REACT_RENDER_ERROR',
      severity: 'critical',
      metadata: { componentStack: info.componentStack },
    });
  }

  private retry = () => {
    window.location.reload();
  };

  private goHome = () => {
    window.location.assign('/');
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="page page--flow">
        <section className="card stack-lg text-center" role="alert">
          <span className="medallion medallion--green" style={{ alignSelf: 'center' }}>🌿</span>
          <h1>Something went wrong</h1>
          <p className="page-sub">Smriti could not finish loading this screen.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Button variant="primary" onClick={this.retry}>Try again</Button>
            <Button variant="secondary" onClick={this.goHome}>Go home</Button>
          </div>
        </section>
      </main>
    );
  }
}
