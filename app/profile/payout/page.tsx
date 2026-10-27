import { SubPage } from "@/components/profile/sub-page";
import { PayoutPanel } from "./payout-panel";

export default function PayoutPage() {
  return (
    <SubPage title="Payout method">
      <PayoutPanel />
    </SubPage>
  );
}
