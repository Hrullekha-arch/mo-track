import { Card } from "@/components/ui/card";

export const PremiumCard = ({ className = "", children }: any) => (
  <Card className={`premium-card ${className}`}>{children}</Card>
);
