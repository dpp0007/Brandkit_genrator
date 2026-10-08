import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="bg-footer text-white">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-6 py-16 md:flex-row md:items-end md:justify-between md:px-12">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-[14px] text-stone">Brand DNA, reconstructed from the live web with TinyFish.</p>
        </div>
        <div className="micro !text-stone">Evidence-backed · Reusable by humans and agents</div>
      </div>
    </footer>
  );
}
