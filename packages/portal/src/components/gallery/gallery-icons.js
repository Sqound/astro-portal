/**
 * The icons of the private gallery's pages and of its list (the list's
 * filter bar): drawn by the server's page and by the browser's list
 * (`PrivateGalleryGrid.js`) alike.
 */

export const Icon = ({ children, size = 18, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {children}
  </svg>
);
export const ImageIcon = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M20.5 16l-5-5L6 19" />
  </Icon>
);
