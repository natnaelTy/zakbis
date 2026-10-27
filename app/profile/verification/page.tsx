import { SubPage } from "@/components/profile/sub-page";
import { VerificationStatus } from "@/components/traveler/verification-status";

export default function VerificationPage() {
  return (
    <SubPage title="Verification">
      <div className="mt-6">
        <VerificationStatus />
      </div>
    </SubPage>
  );
}
