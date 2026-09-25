import { useEffect } from 'react';

let activeLocks = 0;
let previousBodyOverflow = '';
let previousBodyOverscroll = '';
let previousHtmlOverflow = '';
let previousHtmlOverscroll = '';
let previousBodyPosition = '';
let previousBodyTop = '';
let previousBodyWidth = '';
let lockedScrollX = 0;
let lockedScrollY = 0;
let fixedForTouch = false;

export function useBodyScrollLock() {
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;

    if (activeLocks === 0) {
      previousBodyOverflow = body.style.overflow;
      previousBodyOverscroll = body.style.overscrollBehavior;
      previousHtmlOverflow = html.style.overflow;
      previousHtmlOverscroll = html.style.overscrollBehavior;
      previousBodyPosition = body.style.position;
      previousBodyTop = body.style.top;
      previousBodyWidth = body.style.width;
      lockedScrollX = window.scrollX;
      lockedScrollY = window.scrollY;
      fixedForTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false;

      body.style.overflow = 'hidden';
      body.style.overscrollBehavior = 'none';
      html.style.overflow = 'hidden';
      html.style.overscrollBehavior = 'none';
      // Overflow alone does not reliably stop the page behind a dialog on touch browsers.
      if (fixedForTouch) {
        body.style.position = 'fixed';
        body.style.top = `-${lockedScrollY}px`;
        body.style.width = '100%';
      }
    }
    activeLocks += 1;

    return () => {
      activeLocks -= 1;
      if (activeLocks === 0) {
        body.style.overflow = previousBodyOverflow;
        body.style.overscrollBehavior = previousBodyOverscroll;
        html.style.overflow = previousHtmlOverflow;
        html.style.overscrollBehavior = previousHtmlOverscroll;
        if (fixedForTouch) {
          body.style.position = previousBodyPosition;
          body.style.top = previousBodyTop;
          body.style.width = previousBodyWidth;
          window.scrollTo(lockedScrollX, lockedScrollY);
        }
      }
    };
  }, []);
}
