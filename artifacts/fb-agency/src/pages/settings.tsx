import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useGetAgencySettings, getGetAgencySettingsQueryKey, useSetupFacebookApp, useUpdateAgencySettings } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ChevronRight, ExternalLink, ShieldAlert, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Settings() {
  const { data: settings, isLoading } = useGetAgencySettings({ query: { queryKey: getGetAgencySettingsQueryKey() } });
  const setupFacebookApp = useSetupFacebookApp();
  const updateSettings = useUpdateAgencySettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState("");
  const [agencyName, setAgencyName] = useState("");

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const generatedPrivacyUrl = `${baseUrl}/privacy`;

  useEffect(() => {
    if (settings) {
      setStep(settings.setupStep || 0);
      setAppId(settings.appId || "");
      setAppSecret(settings.appSecret || "");
      setPrivacyPolicyUrl(settings.privacyPolicyUrl || generatedPrivacyUrl);
      setAgencyName(settings.agencyName || "");
    }
  }, [settings, generatedPrivacyUrl]);

  const handleUpdateAgencyName = () => {
    updateSettings.mutate(
      { data: { agencyName } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAgencySettingsQueryKey() });
          toast({ title: "Agency name updated" });
        }
      }
    );
  };

  const handleNextStep = (nextStep: number, extraData: any = {}) => {
    setupFacebookApp.mutate(
      { data: { step: nextStep, ...extraData } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAgencySettingsQueryKey() });
          toast({ title: "Progress saved" });
          setStep(nextStep);
        }
      }
    );
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
      case 1:
        return (
          <div className="space-y-6">
            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Step 1: Create Facebook App</h4>
              <p className="text-sm text-muted-foreground mb-4">
                You need to create a Facebook Developer App to get your own credentials. This ensures your clients' data remains under your control.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" asChild>
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="gap-2">
                    Facebook Developer Portal <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button variant="secondary" className="gap-2">
                  <Play className="h-4 w-4" />
                  Watch Setup Tutorial
                </Button>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="appId">App ID</Label>
                <Input id="appId" value={appId} onChange={e => setAppId(e.target.value)} placeholder="123456789012345" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="appSecret">App Secret</Label>
                <Input id="appSecret" type="password" value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder="••••••••••••••••••••••••••••••••" />
              </div>
            </div>

            <Button 
              className="w-full gap-2" 
              onClick={() => handleNextStep(2, { appId, appSecret })}
              disabled={!appId || !appSecret || setupFacebookApp.isPending}
            >
              Continue to Privacy Settings <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Step 2: Privacy Settings</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Facebook requires a valid Privacy Policy URL for your app. We've generated one for your agency. Copy this URL and paste it into the Basic Settings of your Facebook App.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Your Privacy Policy URL</Label>
              <div className="flex gap-2">
                <Input value={privacyPolicyUrl} readOnly className="bg-muted/50" />
                <Button variant="secondary" onClick={() => {
                  navigator.clipboard.writeText(privacyPolicyUrl);
                  toast({ title: "URL copied to clipboard" });
                }}>Copy</Button>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button 
                className="flex-1 gap-2" 
                onClick={() => handleNextStep(3, { privacyPolicyUrl })}
                disabled={setupFacebookApp.isPending}
              >
                Continue to Go Live <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
             <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg">
              <div className="flex items-center gap-2 text-primary font-semibold mb-2">
                <Sparkles className="h-5 w-5" />
                Step 3: Go Live
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Your credentials are saved. The final step is to toggle your Facebook App from "Development" to "Live" mode in the top header of the Facebook Developer Portal.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button 
                className="flex-1 gap-2" 
                onClick={() => {
                  setupFacebookApp.mutate(
                    { data: { step: 4 } },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: getGetAgencySettingsQueryKey() });
                        toast({ title: "Setup complete!" });
                      }
                    }
                  );
                }}
                disabled={setupFacebookApp.isPending}
              >
                <CheckCircle2 className="h-4 w-4" />
                I've set the app to Live
              </Button>
            </div>
          </div>
        );
      default:
        return (
           <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="bg-green-500/10 p-4 rounded-full mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h3 className="text-xl font-bold mb-2">App Configured Successfully</h3>
            <p className="text-muted-foreground max-w-sm mb-6">
              Your Bring-Your-Own-Credentials setup is complete. You can now connect Facebook accounts and manage pages securely.
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>Reconfigure App</Button>
          </div>
        );
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-8 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Agency Settings</h1>
          <p className="text-muted-foreground mt-1">Configure your white-label agency details and Facebook API credentials.</p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-[300px] w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Agency Details</CardTitle>
                <CardDescription>Your agency's public facing information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 max-w-md">
                  <Label htmlFor="agencyName">Agency Name</Label>
                  <Input id="agencyName" value={agencyName} onChange={e => setAgencyName(e.target.value)} />
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={handleUpdateAgencyName} disabled={updateSettings.isPending || agencyName === settings?.agencyName}>
                  Save Changes
                </Button>
              </CardFooter>
            </Card>

            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-primary" />
                  Bring Your Own Credentials (BYOC)
                </CardTitle>
                <CardDescription>
                  Configure your own Facebook Developer App to ensure full ownership of client connections.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex mb-8 items-center justify-between relative max-w-md mx-auto">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted -z-10">
                    <div 
                      className="h-full bg-primary transition-all duration-500" 
                      style={{ width: `${(Math.min(step || 1, 3) - 1) * 50}%` }} 
                    />
                  </div>
                  {[1, 2, 3].map((s) => (
                    <div 
                      key={s} 
                      className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm border-4 bg-background transition-colors
                        ${(step || 1) >= s ? "border-primary text-primary" : "border-muted text-muted-foreground"}`}
                    >
                      {s}
                    </div>
                  ))}
                </div>

                <div className="max-w-xl mx-auto">
                  {renderStepContent()}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}

function Play(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  )
}
