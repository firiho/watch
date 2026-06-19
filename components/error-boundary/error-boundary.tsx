'use client';

import React from 'react';
import styles from './error-boundary.module.css';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.wrap} role="alert">
          <div className={styles.card}>
            <h2 className={styles.title}>Something went wrong</h2>
            <p className={styles.text}>An unexpected error occurred. Try reloading the page.</p>
            <button type="button" className={styles.button} onClick={this.handleReload}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
