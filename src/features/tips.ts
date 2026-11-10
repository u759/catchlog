import { useEffect, useState } from 'react';

import { getState, setState } from '@/lib/sync/db';

/**
 * One-time tips (e.g. "save the lakes you'll fish while you have signal"). Shown until dismissed; the dismissal is
 * kept on this phone.
 */
export function useTip(key: string): [boolean, () => void] {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let alive = true;
    getState(`tip:${key}`)
      .then((v) => alive && setVisible(v == null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  const dismiss = () => {
    setVisible(false);
    setState(`tip:${key}`, 'dismissed').catch(() => {});
  };
  return [visible, dismiss];
}
