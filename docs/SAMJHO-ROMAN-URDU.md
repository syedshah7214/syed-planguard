# PlanGuard ko samjho (Roman Urdu)

**Ek line mein:** PlanGuard `terraform apply` se pehle Terraform plan parhta hai, AWS ka mahana kharcha batata hai, security aur safety ke 18 rules check karta hai, aur pipeline ko PASS / WARN / FAIL deta hai.

## Masla kya hai?
- Ghalti se SSH (port 22) poori duniya ke liye khul jata hai.
- Database public ho jata hai.
- NAT Gateway ($33/mahina) ya EKS ($73/mahina) chupke se bill barha dete hain.
- Ek chhoti si tabdeeli production database ko **replace** kar deti hai, yani data chala jata hai.

`terraform plan` yeh batata hai ke kya badlega, lekin yeh nahi batata ke woh **safe** hai ya **sasta**. PlanGuard yahi batata hai.

## Kaise kaam karta hai
1. `terraform show -json` ka output parhta hai (`plan.py`).
2. Har resource ka mahana kharcha nikalta hai (`pricing.py`). Yeh us-east-1 ki list prices hain, aur data transfer is mein shamil nahi.
3. 18 rules chalata hai (`rules.py`). Har rule ki ID, severity aur fix likha hai.
4. Faisla karta hai (`analyzer.py`):
   - **FAIL:** high ya critical masla ho, ya kharcha budget se upar ho.
   - **WARN:** medium masla ho, ya kharcha budget ke 80% tak pahunch jaye.
   - **PASS:** baaki sab soorat mein.

## Interview ke sawal
- **Asal plan ke baghair kaise test kiya?** CI mein `examples/terraform` par asli `terraform plan` chalta hai, lekin placeholder credentials ke saath, is liye AWS account ki zaroorat nahi padti. Secure plan PASS hona chahiye aur insecure FAIL. Aisa na ho to CI khud fail ho jata hai.
- **Prices ghalat hon to?** Price table aur us ki pabandiyan Pricing page par likhi hain. Yeh tool bade aur anokhe kharche pakadne ke liye hai, invoice banane ke liye nahi.
- **Change-safety rule kyun zaroori hai?** Database ya bucket ka "replace" ya "delete" ho to data hamesha ke liye ja sakta hai. Is liye yeh sab se upar, critical level par hai.
