import { SubPage } from "@/components/profile/sub-page";
import { SignInPanel } from "./sign-in-panel";

export default function SignInMethodsPage() {
  return (
    <SubPage title="Ways to sign in" note="Only you can see these.">
      <SignInPanel />
    </SubPage>
  );
}
