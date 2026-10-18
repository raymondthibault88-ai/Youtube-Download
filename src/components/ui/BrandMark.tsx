import logo from "../../assets/logo.png";

export default function BrandMark({ className = "" }: { className?: string }) {
  return <img className={className} src={logo} width="40" height="40" alt="" aria-hidden="true" />;
}
