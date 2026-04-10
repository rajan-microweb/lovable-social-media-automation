import { ContentView } from "./Content";
import { SOCIAL_STATUS_PUBLISHED } from "@/types/social";

export default function History() {
  return (
    <ContentView 
      initialMode="all" 
      initialStatus={SOCIAL_STATUS_PUBLISHED} 
      showModeTabs={true} 
    />
  );
}
