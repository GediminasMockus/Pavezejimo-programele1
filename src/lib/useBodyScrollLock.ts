import { useEffect } from 'react';

let activeLocks = 0;
let previousBodyOverflow = '';
let previousBodyOverscroll = '';
let previousHtmlOverflow = '';
let previousHtmlOverscroll = '';

export function useBodyScrollLock() {
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;

    if (activeLocks === 0) {
      previousBodyOverflow = body.style.overflow;
      previousBodyOverscroll = body.style.overscrollBehavior;
      previousHtmlOverflow = html.style.overflow;
      previousHtmlOverscroll = html.style.overscrollBehavior;

      body.style.overflow = 'hidden';
      body.style.overscrollBehavior = 'none';
      html.style.overflow = 'hidden';
      html.style.overscrollBehavior = 'none';
    }
    activeLocks += 1;

    return () => {
      activeLocks -= 1;
      if (activeLocks === 0) {
        body.style.overflow = previousBodyOverflow;
        body.style.overscrollBehavior = previousBodyOverscroll;
        html.style.overflow = previousHtmlOverflow;
        html.style.overscrollBehavior = previousHtmlOverscroll;
      }
    };
  }, []);
}
