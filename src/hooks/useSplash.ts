import { useEffect } from 'react';

export default function useSplash() {
  useEffect(() => {
    document.body.classList.remove('app-loading');
    document.body.classList.add('app-ready');
    const splash = document.getElementById('splash');
    if (!splash) {
      return undefined;
    }

    const removeTimer = setTimeout(() => {
      splash.remove();
    }, 250);

    return () => clearTimeout(removeTimer);
  }, []);
}
