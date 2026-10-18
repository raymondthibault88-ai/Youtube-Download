import { Component } from 'react';
import type { ReactNode } from 'react';
import BrandMark from './ui/BrandMark';

export default class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    document.body.classList.remove('app-loading');
    document.body.classList.add('app-ready');
    document.getElementById('splash')?.remove();
  }
  render() {
    if (this.state.failed)
      return (
        <main className="recovery-screen">
          <BrandMark className="brand-mark" />
          <h1>L’interface n’a pas pu démarrer.</h1>
          <p>Relancez l’affichage. Si le problème persiste, fermez puis rouvrez l’application.</p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => window.location.reload()}
          >
            Relancer l’affichage
          </button>
        </main>
      );
    return this.props.children;
  }
}
