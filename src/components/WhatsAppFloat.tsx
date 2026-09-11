import SafeImage from "./SafeImage";

export default function WhatsAppFloat({ number }: { number: string }) {
  const clean = (number || "").replace(/[^0-9]/g, "");
  const full = clean.startsWith("91") ? clean : `91${clean}`;
  const href = `https://wa.me/${full}?text=${encodeURIComponent(
    "Hi SMS Stores, I'd like help with a product or repair booking."
  )}`;
  if (!clean) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      title="Chat with us on WhatsApp"
      className="wa-float fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-emerald-500 shadow-lg transition hover:scale-105 hover:bg-emerald-600"
    >
      <svg viewBox="0 0 32 32" className="h-8 w-8 text-white" fill="currentColor" aria-hidden>
        <path d="M16.05 4C9.9 4 4.9 9 4.9 15.05c0 2.13.62 4.12 1.7 5.8L4.5 28l7.4-1.55c1.66.9 3.56 1.4 5.6 1.4h.05c6.15 0 11.15-5 11.15-11.1C27.15 9 22.2 4 16.05 4zm0 20.3h-.05c-1.73 0-3.42-.46-4.9-1.33l-.35-.21-4.4.92.93-4.28-.23-.35a8.9 8.9 0 0 1-1.36-4.74c0-4.93 4.02-8.94 8.96-8.94 2.4 0 4.65.93 6.35 2.62a8.9 8.9 0 0 1 2.62 6.35c0 4.94-4.02 8.96-8.97 8.96zm4.9-6.68c-.27-.13-1.58-.78-1.83-.87-.25-.09-.43-.13-.62.13-.18.27-.7.87-.86 1.05-.16.18-.32.2-.6.07-.27-.13-1.14-.42-2.17-1.34-.8-.72-1.34-1.6-1.5-1.87-.16-.27-.02-.42.12-.55.12-.12.27-.32.4-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.47-.07-.13-.62-1.5-.85-2.05-.22-.54-.45-.47-.62-.48l-.54-.01c-.18 0-.48.07-.73.34-.25.27-.95.93-.95 2.27 0 1.34.98 2.63 1.11 2.81.14.18 1.96 3 4.76 4.2.66.28 1.18.45 1.58.58.66.21 1.27.18 1.74.11.53-.08 1.58-.65 1.8-1.27.22-.62.22-1.15.16-1.27-.07-.12-.25-.19-.52-.32z" />
      </svg>
    </a>
  );
}
