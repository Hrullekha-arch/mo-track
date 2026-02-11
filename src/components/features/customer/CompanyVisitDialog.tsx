import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Props ={
  open:boolean;
  onOpenChange:(open:boolean) => void;
}


export default function CompanyVisitDialog( {open,onOpenChange }:Props) {

  
  return (
    <>
    <Dialog  open={open} onOpenChange={onOpenChange}>
  <DialogContent className=" max-w-4xl">
    <DialogHeader>
      <DialogTitle>Company Visit Form</DialogTitle>
      <DialogDescription>
        Create Visit For Company Work!!
        <span>Kindly fill in the details for the company visit.</span>
      </DialogDescription>
    </DialogHeader>
    <Card className="p-4">
      <div className="flex justify-between items-center">
        <div>
          <Label htmlFor="companyFrom">From</Label>
          <Input type="text" id="companyFrom"  placeholder="From" />
        </div>
        <div>
          <Label htmlFor="companyTo">To</Label>
          <Input type="text" id="companyTo" placeholder="To" />
        </div>
        <div>
          <Label htmlFor="visitDate">Visit Date</Label>
          <Input type="date" id="visitDate"  placeholder="Visit Date" />
        </div>
      </div>
      <div className="flex justify-between items-center">
        <div>
          <Label htmlFor="visitType">Select Visit Type</Label>
          <Select>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Visit Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="fabric_collection" >Fabric Collecetion</SelectItem>
                <SelectItem value="sample_showing" >Sample Showing</SelectItem>
                <SelectItem value="material_delivery" >Material Deleivery</SelectItem>
                <SelectItem value="employee_visit" >Employee Visit</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="remark">Remark</Label>
          <Textarea id="remark" placeholder="Remark" />
        </div>
        <div>
          <Button className="mt-6">Submit</Button>
        </div>
      </div>
    </Card>
  </DialogContent>
</Dialog>
</>
  );
}