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
            <div className={styles.icon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M6 6v12M18 6v12M2 10h4M2 14h4M18 10h4M18 14h4" />
                <path d="m10 9.5 4 5M14 9.5l-4 5" />
              </svg>
            </div>
            <p className={styles.eyebrow}>scene interrupted</p>
            <h2 className={styles.title}>Something went wrong</h2>
            <p className={styles.text}>An unexpected error occurred. Try reloading the page.</p>
            <div className={styles.actions}>
              <button type="button" className={styles.button} onClick={this.handleReload}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                Reload
              </button>
              {/* A plain link (full navigation) so recovery doesn't depend on the client router. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className={styles.secondary}>
                Go home
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
