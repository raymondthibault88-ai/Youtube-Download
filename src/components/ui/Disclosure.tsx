import type { ReactNode } from "react";
import { Accordion } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";

export default function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return <Accordion.Root className="disclosure">
    <Accordion.Item value="details">
      <Accordion.Header className="disclosure-heading"><Accordion.Trigger className="disclosure-trigger">{title}<ChevronDown size={16} aria-hidden="true" /></Accordion.Trigger></Accordion.Header>
      <Accordion.Panel className="disclosure-panel"><div>{children}</div></Accordion.Panel>
    </Accordion.Item>
  </Accordion.Root>;
}
