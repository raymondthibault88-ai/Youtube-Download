const paths = {
  download: "M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4",
  convert: "M4 8h13l-3-3m6 11H7l3 3M17 8l-3 3M7 16l3-3",
  folder: "M3 7h7l2 2h9v11H3V7Zm0 0V4h7l2 3",
  file: "M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6",
  check: "m5 12 4 4L19 6",
  alert: "M12 8v5m0 3h.01M12 3 2 21h20L12 3Z",
  close: "m6 6 12 12M6 18 18 6",
  info: "M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
} as const;

export default function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
