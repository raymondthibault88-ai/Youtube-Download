import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export default function useOutputDirStorage(
  setOutputDir: Dispatch<SetStateAction<string>>
) {
  useEffect(() => {
    const savedOutput = window.localStorage.getItem('outputDir');
    if (savedOutput) {
      setOutputDir(savedOutput);
    }
  }, [setOutputDir]);
}
