import { Button, useWizardContext, WizardFooterWrapper } from "@patternfly/react-core";

/** The review screen owns validation, submission and completion. */
export function ReviewNavigation() {
  const { goToPrevStep } = useWizardContext();
  return (
    <WizardFooterWrapper>
      <Button variant="secondary" onClick={goToPrevStep}>Back</Button>
    </WizardFooterWrapper>
  );
}
