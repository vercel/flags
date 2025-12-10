'use client';

export function actAsFlaggedInUser() {
  document.cookie = 'basic-proxy-flag=1; Path=/';
  window.location.reload();
}

export function actAsFlaggedOutUser() {
  document.cookie = 'basic-proxy-flag=0; Path=/';
  window.location.reload();
}

export function clear() {
  document.cookie =
    'basic-proxy-flag=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  window.location.reload();
}
