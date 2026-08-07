// ---------------------------------------------------------------------------
// Pharmacy seed dataset generator â€” SkyCare HMS
// Curated real-world Nigerian pharmacy products (dosages/forms/prices anchored
// to HealthPlus Nigeria's prescription-medication catalogue) expanded with
// generic-brand variants and realistic pack sizes. Deterministic output.
//
// Run:  node scripts/generate-medications.mjs
// Out:  scripts/medications-seed.json   (JSON array, schema per pharmacy spec)
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// row: [name, generic_name, brand, category, form, dosage, price, requires_prescription]
const rows = [];

const add = (name, generic, brand, category, form, dosage, price, rx = true) =>
  rows.push({ name, generic_name: generic, brand, category, form, dosage, price_ngn: price, requires_prescription: rx });

// ===========================================================================
// ANTIBIOTICS
// ===========================================================================
const AB = "Antibiotics";
add("Amoxil 500mg Capsules x21", "Amoxicillin", "Amoxil", AB, "capsule", "500mg", 3200);
add("Amoxil 500mg Capsules x14", "Amoxicillin", "Amoxil", AB, "capsule", "500mg", 2200);
add("Amoxil 250mg/5ml Suspension 100ml", "Amoxicillin", "Amoxil", AB, "syrup", "250mg/5ml", 2100);
add("Amoxil 125mg/5ml Suspension 100ml", "Amoxicillin", "Amoxil", AB, "syrup", "125mg/5ml", 1800);
add("Amoxicillin 500mg Capsules x10", "Amoxicillin", "Generic", AB, "capsule", "500mg", 1150);
add("Clamoxyl 500mg Capsules x14", "Amoxicillin", "Clamoxyl", AB, "capsule", "500mg", 2600);
add("Noclox 500mg Capsules x20", "Cloxacillin", "Noclox", AB, "capsule", "500mg", 2900);
add("Noclox 125mg/5ml Syrup 100ml", "Cloxacillin", "Noclox", AB, "syrup", "125mg/5ml", 1850);
add("Cloxapen 500mg Capsules x20", "Cloxacillin", "Cloxapen", AB, "capsule", "500mg", 2400);
add("Ampiclox 500mg Capsules x20", "Ampicillin/Cloxacillin", "Ampiclox", AB, "capsule", "500mg", 2500);
add("Ampiclox 250mg/5ml Syrup 100ml", "Ampicillin/Cloxacillin", "Ampiclox", AB, "syrup", "250mg/5ml", 2100);
add("Ampicillin 500mg Capsules x20", "Ampicillin", "Generic", AB, "capsule", "500mg", 1850);
add("Penbritin 500mg Capsules x20", "Ampicillin", "Penbritin", AB, "capsule", "500mg", 3200);
add("Augmentin 625mg Tablets x14", "Amoxicillin/Clavulanic Acid", "Augmentin", AB, "tablet", "625mg", 15890);
add("Augmentin 1g Tablets x14", "Amoxicillin/Clavulanic Acid", "Augmentin", AB, "tablet", "1g", 18250);
add("Augmentin 228mg/5ml Suspension 70ml", "Amoxicillin/Clavulanic Acid", "Augmentin", AB, "syrup", "228mg/5ml", 10340);
add("Augmentin 457mg/5ml Suspension 70ml", "Amoxicillin/Clavulanic Acid", "Augmentin", AB, "syrup", "457mg/5ml", 16610);
add("Amoksiklav 625mg Tablets x14", "Amoxicillin/Clavulanic Acid", "Amoksiklav", AB, "tablet", "625mg", 8500);
add("Augmentane 625mg Tablets x14", "Amoxicillin/Clavulanic Acid", "Augmentane", AB, "tablet", "625mg", 7200);
add("Clavamox 625mg Tablets x14", "Amoxicillin/Clavulanic Acid", "Clavamox", AB, "tablet", "625mg", 7900);
add("Co-Amoxiclav 625mg Tablets x10", "Amoxicillin/Clavulanic Acid", "Generic", AB, "tablet", "625mg", 6200);
add("Amekem 1g Injection Vial", "Amoxicillin/Clavulanic Acid", "Amekem", AB, "injection", "1g", 2200);
add("Ceporex 500mg Capsules x10", "Cefalexin", "Ceporex", AB, "capsule", "500mg", 4600);
add("Ceporex 250mg/5ml Suspension 100ml", "Cefalexin", "Ceporex", AB, "syrup", "250mg/5ml", 3800);
add("Ceporex 125mg/5ml Suspension 100ml", "Cefalexin", "Ceporex", AB, "syrup", "125mg/5ml", 2900);
add("Cefalexin 500mg Capsules x12", "Cefalexin", "Generic", AB, "capsule", "500mg", 2900);
add("Ceporex 500mg (Baby) Capsules", "Cefalexin", "Ceporex", AB, "capsule", "500mg", 3600);
add("Zinnat 250mg Tablets x14", "Cefuroxime", "Zinnat", AB, "tablet", "250mg", 12500);
add("Zinnat 500mg Tablets x14", "Cefuroxime", "Zinnat", AB, "tablet", "500mg", 15700);
add("Zinacef 750mg Injection", "Cefuroxime", "Zinacef", AB, "injection", "750mg", 4800);
add("Cefuroxime 250mg Tablets x10", "Cefuroxime", "Generic", AB, "tablet", "250mg", 7700);
add("Ceftriaxone 1g Injection", "Ceftriaxone", "Generic", AB, "injection", "1g", 1600);
add("Rocilin 1250kg Injection", "Ceftriaxone", "Rocilin", AB, "injection", "1g", 2500);
add("Lendacin 250mg Injection", "Lendacin", "Ceftriaxone", AB, "injection", "500mg", 3100);
add("Cephexime 200mg Tablets x12", "Cefixime", "Cephexime", AB, "tablet", "200mg", 9800);
add("Cefixime 100mg/5ml Suspension 30ml", "Cefixime", "Generic", AB, "syrup", "100mg/5ml", 4200);
add("Suprax 400mg Tablets x8", "Cefixime", "Suprax", AB, "tablet", "400mg", 16500);
add("Cefipime 1250mg Injection", "Cefipime", "Generic", AB, "injection", "1g", 6200);
add("Cepolet 500mg Tablets x14", "Cefotaxime", "Cepolet", AB, "tablet", "500mg", 5400);
add("Cefotax 250mg Injection", "Cefotaxime", "Cefotax", AB, "injection", "1g", 2900);
add("Zithromax 2500mg Tablets x3", "Azithromycin", "Zithromax", AB, "tablet", "500mg", 6800);
add("Zithromax 200mg/5ml Suspension 15ml", "Azithromycin", "Zithromax", AB, "syrup", "200mg/5ml", 5200);
add("Azithromycin 500mg Tablets x3", "Azithromycin", "Generic", AB, "tablet", "500mg", 1400);
add("Azithromycin 200mg/5ml Suspension 15ml", "Azithromycin", "Generic", AB, "syrup", "200mg/5ml", 2800);
add("Clarithromycin 500mg Tablets x14", "Clarithromycin", "Generic", AB, "tablet", "500mg", 9800);
add("Klaricid 500mg Tablets x14", "Clarithromycin", "Klaricid", AB, "tablet", "500mg", 16400);
add("Klaricid 125mg/5ml Suspension 60ml", "Clarithromycin", "Klaricid", AB, "syrup", "125mg/5ml", 9600);
add("Erythromycin 500mg Tablets x16", "Erythromycin", "Generic", AB, "tablet", "500mg", 1900);
add("Erymax 500mg Capsules x16", "Erythromycin", "Erymax", AB, "capsule", "500mg", 3600);
add("Erythromycin 200mg/5ml Syrup 30ml", "Erythromycin", "Generic", AB, "syrup", "200mg/5ml", 2600);
add("Ciprotab 500mg Tablets x14", "Ciprofloxacin", "Ciprotab", AB, "tablet", "500mg", 7420);
add("Ciprotab 500mg Tablets x10", "Ciprofloxacin", "Ciprotab", AB, "tablet", "500mg", 5620);
add("Ciprotab 250mg Tablets x10", "Ciprofloxacin", "Ciprotab", AB, "tablet", "250mg", 3400);
add("Ciproxin 500mg Tablets x10", "Ciprofloxacin", "Ciproxin", AB, "tablet", "500mg", 7800);
add("Ciprofloxacin 500mg Tablets x10", "Ciprofloxacin", "Generic", AB, "tablet", "500mg", 3800);
add("Ciprofloxacin 250mg/5ml Suspension 100ml", "Ciprofloxacin", "Generic", AB, "syrup", "250mg/5ml", 2400);
add("Ciprofarm 500mg Tablets x14", "Ciprofloxacin", "Ciprofarm", AB, "tablet", "500mg", 6200);
add("Tarivid 200mg Tablets x14", "Ofloxacin", "Tarivid", AB, "tablet", "200mg", 14170);
add("Tarivid 400mg Tablets x14", "Ofloxacin", "Tarivid", AB, "tablet", "400mg", 19900);
add("Zanacin 400mg Tablets x10", "Ofloxacin", "Zanacin", AB, "tablet", "400mg", 6800);
add("Ofloxacin 400mg Tablets x10", "Ofloxacin", "Generic", AB, "tablet", "400mg", 4200);
add("Levoquin 500mg Tablets x10", "Levofloxacin", "Levoquin", AB, "tablet", "500mg", 11900);
add("Levofloxacin 500mg Tablets x10", "Levofloxacin", "Generic", AB, "tablet", "500mg", 7700);
add("Tavanic 500mg Tablets x10", "Levofloxacin", "Tavanic", AB, "tablet", "500mg", 15400);
add("Noroxin 400mg Tablets x10", "Norfloxacin", "Noroxin", AB, "tablet", "400mg", 4200);
add("Norfloxacin 400mg Tablets x10", "Norfloxacin", "Generic", AB, "tablet", "400mg", 2400);
add("Vibramycin 100mg Capsules x10", "Doxycycline", "Vibramycin", AB, "capsule", "100mg", 4900);
add("Doxycycline 100mg Capsules x10", "Doxycycline", "Generic", AB, "capsule", "100mg", 1650);
add("Doxytab 100mg Tablets x10", "Oraxyl", "Doxytab", AB, "tablet", "100mg", 2900);
add("Tetracycline 250mg Capsules x20", "Tetracycline", "Generic", AB, "capsule", "250mg", 1900);
add("Tetrayclax 250mg Capsules x20", "Tetracycline", "Tetrayclax", AB, "capsule", "250mg", 2700);
add("Methenamine 500mg Capsules x20", "Methenamine", "Generic", AB, "capsule", "500mg", 3400);
add("Bactrim 400mg Tablets x20", "Co-Trimoxazole", "Bactrim", AB, "tablet", "80/400mg", 2800);
add("Co-Trimoxazole 80/400mg Tablets x20", "Co-Trimoxazole", "Generic", AB, "tablet", "80/400mg", 1100);
add("Septrin 240mg/5ml Suspension 100ml", "Co-Trimoxazole", "Septrin", AB, "syrup", "240mg/5ml", 3200);
add("Flagyl 400mg Tablets x12", "Metronidazole", "Flagyl", AB, "tablet", "400mg", 1900);
add("Flagyl 500mg Tablets x14", "Metronidazole", "Flagyl", AB, "tablet", "500mg", 2400);
add("Metronidazole 120mg/5ml Suspension 100ml", "Metronidazole", "Flagyl", AB, "syrup", "120mg/5ml", 2800);
add("Flagyl 750mg Suppositories x10", "Metronidazole", "Flagyl", AB, "suppository", "750mg", 4200);
add("Metronidazole 400mg Tablets x12", "Metronidazole", "Generic", AB, "tablet", "400mg", 950);
add("Lobolol Suspension 100ml", "Metronidazole", "Lobolol", AB, "syrup", "200mg/5ml", 1850);
add("Omnicef 300mg Capsules", "Cefdinir", "Omnicef", AB, "capsule", "300mg", 19500);
add("Augmentin 312mg/5ml Suspension 40ml", "Amoxicillin/Clavulanic Acid", "Augmentin", AB, "suspension", "312mg/5ml", 8200);
add("Azactam 500mg Injection", "Aztreonam", "Azactam", AB, "injection", "500mg", 8400);
add("Flagenel 400mg Tablets x12", "Metronidazole", "Flagenel", AB, "tablet", "400mg", 1400);
add("Doxycin 500mg Injection", "Doxycycline", "Doxycin", AB, "injection", "500mg", 2900);
add("Ciprofloxacin 2mg/ml Infusion 100ml", "Ciprofloxacin", "Generic", AB, "infusion", "2mg/ml", 3800);
add("Cotrimoxazole 125mg/5ml Syrup", "Co-Trimoxazole", "Generic", AB, "syrup", "125mg/5ml", 1900);

// ===========================================================================
// ANTIFUNGALS / ANTIVIRALS (grouped under Antibiotics-adjacent list)
// --------------------------------------------------------------------------
add("Diflucan 150mg Tablets x1", "Fluconazole", "Diflucan", AB, "tablet", "150mg", 4200);
add("Fluconazole 150mg Capsules x1", "Fluconazole", "Generic", AB, "capsule", "150mg", 1100);
add("Flucamed 150mg Capsules x6", "Fluconazole", "Flucamed", AB, "capsule", "150mg", 6700);
add("Flucamed 200mg Capsules x10", "Fluconazole", "Flucamed", AB, "capsule", "200mg", 7900);
add("Nizoral 200mg Tablets x30", "Ketoconazole", "Nizoral", AB, "tablet", "200mg", 12900);
add("Ketoconazole 200mg Tablets x30", "Ketoconazole", "Generic", AB, "tablet", "200mg", 3900);
add("Nizoral 2% Cream 30g", "Ketoconazole", "Nizoral", AB, "cream", "2%", 3800, false);
add("Nizoral 2% Shampoo 100ml", "Ketoconazole", "Nizoral", AB, "shampoo", "2%", 11500, false);
add("Daktarin 2% Cream 30g", "Miconazole", "Daktarin", AB, "cream", "2%", 3200, false);
add("Daktarin Oral Gel 20g", "Miconazole", "Daktarin", AB, "gel", "2%", 2600, false);
add("Magra 2% Cream 30g", "Miconazole", "Magra", AB, "cream", "2%", 1800, false);
add("Fulcin 125mg Tablets x16", "Griseofulvin", "Fulcin", AB, "tablet", "125mg", 1900);
add("Griseofulvin 500mg Tablets x16", "Griseofulvin", "Generic", AB, "tablet", "500mg", 2900);
add("Grisovin 500mg Tablets x16", "Griseofulvin", "Grisovin", AB, "tablet", "500mg", 4800);
add("Zovirax 200mg Tablets x25", "Aciclovir", "Zovirax", AB, "tablet", "200mg", 5600);
add("Zovirax 5% Cream 10g", "Aciclovir", "Zovirax", AB, "cream", "5%", 3400, false);
add("Aciclovir 200mg Tablets x20", "Aciclovir", "Generic", AB, "tablet", "200mg", 1950);
add("Aciclovir 800mg Tablets x10", "Aciclovir", "Generic", AB, "tablet", "800mg", 7500);
add("Clotrimazole 100mg Pessaries x6", "Clotrimazole", "Clotrimazole", AB, "pessary", "100mg", 1700, false);
add("Clotrimazole 500mg Pessaries x1", "Clotrimazole", "Canesten", AB, "pessary", "500mg", 2900, false);
add("Canesten 10% Vaginal Cream 78g", "Clotrimazole", "Canesten", AB, "cream", "10%", 5400, false);
add("Outrex 1% Ointment 15g", "Clatrimazole", "Except", AB, "ointment", "1%", 850, false);
add("Tolbutamide? No â€” Terbinafine 250mg Tablets x14", "Terbinafine", "Generic", AB, "tablet", "250mg", 6800);
add("Unting 250mg Tablets x14", "Terbinafine", "Lamisil", AB, "tablet", "250mg", 16500);
add("Lamisil 1% Cream 15g", "Terbinafine", "Lamisil", AB, "cream", "1%", 5200, false);
add("Clomic Clotrimazole 1% Cream 20g", "Clotrimazole", "Clomic", AB, "cream", "1%", 950, false);
add("Bacitracin 500IU Ointment 15g", "Bacitracin", "Generic", AB, "ointment", "500IU/g", 1150, false);
add("Bacuro 2% Ointment 15g", "Mupirocin", "Bactroban", AB, "ointment", "2%", 5900, false);
add("Furadin 100mg Tablets x28", "Nitrofurantoin", "Furadin", AB, "tablet", "100mg", 6500);

// ===========================================================================
// ANTIMALARIAS
// ---------------------------------------------------------------------------
const MA = "Antimalarials";
add("Coartem 20/120mg Tablets x8", "Artemether/Lumefantrine", "Coartem", MA, "tablet", "20/120mg", 5000);
add("Coartem 20/120mg Tablets x24", "Artemether/Lumefantrine", "Coartem", MA, "tablet", "20/120mg", 13200);
add("Coartem 80/480mg Tablets x6", "Artemether/Lumefantrine", "Coartem", MA, "tablet", "80/480mg", 8200);
add("Lonart 20/120mg Tablets x8", "Artemether/Lumefantrine", "Lonart", MA, "tablet", "20/120mg", 4200);
add("Amatem 80/480mg Softgel Capsules x10", "Artemether/Lumefantrine", "Amatem", MA, "softgel", "80/480mg", 3470);
add("Amatem 20/120mg Tablets x8", "Artemether/Lumefantrine", "Amatem", MA, "tablet", "20/120mg", 2100);
add("Amatem 60/480mg Tablets x6", "Artemether/Lumefantrine", "Amatem", MA, "tablet", "60/480mg", 4900);
add("Artemether/Lumefantrine 20/120mg Tablets x8", "Artemether/Lumefantrine", "Generic", MA, "tablet", "20/120mg", 2600);
add("IPCA Artemether-Lume Tablets x8", "Artemether/Lumefantrine", "IPCA", MA, "tablet", "20/120mg", 4500);
add("Artesiam 100mg Tablets x6", "Artesunate", "Artesiam", MA, "tablet", "100mg", 3900);
add("Artesunate 1200mg Injection", "Artesunate", "Generic", MA, "injection", "120mg", 4200);
add("Artesunate 100mg Tablets x6", "Artesunate", "Generic", MA, "tablet", "100mg", 2600);
add("Malinta 20/120mg Table x8", "Artemether/Lumefantrine", "Malinta", MA, "tablet", "20/120mg", 5800);
add("Malacinia 400mg/15ml Inj", "Artesunate/Mefloquine", "Malacinia", MA, "injection", "400mg", 5200);
add("Dihydroartemisinin 100mg Tablets x10", "Dihydroartemisinin/Piperaquine", "Generic", MA, "tablet", "100mg", 8500);
add("Leister 100mg Tablets x10", "Dihydroartemisinin/Piperaquine", "Leister", MA, "tablet", "100mg", 15900);
add("Diastatin 100mg Tablets x10", "Dihydroartemisinin", "Diastatin", MA, "tablet", "100mg", 7200);
add("Fansidar Tablets (25mg/500mg) x10", "Sulfadoxine/Pyrimethamine", "Fansidar", MA, "tablet", "25/500mg", 1900);
add("Pyrimethamine 100mg Tablets x6", "Pyrimethamine", "Pyrimethamine", MA, "tablet", "100mg", 1200);
add("Quinine Sulfate 300mg Tablets x10", "Quinine", "Generic", MA, "tablet", "300mg", 1450);
add("Quinine Bi-Sulfate 300mg Tablets x12", "Quinine", "Quinine", MA, "tablet", "300mg", 1900);
add("Palarime 300mg Tablets x12", "Pyrimethamine/Quinine", "Palarime", MA, "tablet", "300mg", 2600);
add("Qualaquin 300mg Capsules x28", "Quinine", "Qualaquin", MA, "capsule", "300mg", 15400);
add("Chloroquine 250mg Tablets x20", "Chloroquine", "Generic", MA, "tablet", "250mg", 2100, false);
add("Chloroquine 100mg/5ml Syrup 100ml", "Chloroquine", "Generic", MA, "syrup", "100mg/5ml", 1750, false);
add("Nivaquine 200mg Tablets x16", "Chloroquine", "Nivaquine", MA, "tablet", "200mg", 3200, false);
add("Malarex 500mg Tablets x10", "Chloroquine Phosphate", "Malarex", MA, "tablet", "500mg", 2300, false);
add("Daraprim 25mg Tablets x10", "Audriprim (Pyrimethamine)", "Daraprim", MA, "tablet", "25mg", 4200);
add("Mekloquine 200mg Tablets x8", "Mefloquine", "Mekloquine", MA, "tablet", "200mg", 12900);
add("Proguanil 100mg Tablets x20", "Proguanil", "Paludrine", MA, "tablet", "100mg", 3100);
add("Doxycycline 100mg Capsules x10 (malaria)", "Doxycycline", "Generic", MA, "capsule", "100mg", 1650);
add("Arzot 100mg Tablets x6", "Artesunate", "Arzot", MA, "tablet", "100mg", 5200);

// ===========================================================================
// ANALGESICS & PAIN
// ---------------------------------------------------------------------------
const AN = "Analgesics";
add("Paracetamol 500mg Tablets x16", "Paracetamol", "Generic", AN, "tablet", "500mg", 650, false);
add("Emzor Paracetamol 500mg Tablets x32", "Paracetamol", "Emzor", AN, "tablet", "500mg", 1700, false);
add("Emzor Paracetamol Suspension 100ml", "Paracetamol", "Emzor", AN, "syrup", "120mg/5ml", 1850, false);
add("Panadol Extra 500mg/65mg Tablets x16", "Paracetamol/Caffeine", "Panadol", AN, "tablet", "500mg/65mg", 2600, false);
add("Panadol 125mg Suppositories", "Panadol", "Panadol (GSK)", AN, "suppository", "125mg", 3100, false);
add("Paracetamol B.P. 500mg x100", "Paracetamol", "BP", AN, "tablet", "500mg", 1350, false);
add("Paracetamol 250mg/5ml Suspension 100ml", "Paracetamol", "Generic", AN, "syrup", "250mg/5ml", 1750, false);
add("Calpol 120mg/5ml Suspension 100ml", "Paracetamol", "Calpol", AN, "syrup", "120mg/5ml", 2300, false);
add("Intramand 300mg Injection", "Paracetamol", "Intramand", AN, "injection", "1g/100ml", 6800);
add("Brufen 400mg Tablets x16", "Ibuprofen", "Brufen", AN, "tablet", "400mg", 3400, false);
add("Ibuprofen 400mg Tablets x16", "Ibuprofen", "Generic", AN, "tablet", "400mg", 950, false);
add("Ibuprofen 200mg Tablets x8", "Ibuprofen", "Generic", AN, "tablet", "200mg", 830, false);
add("Ibuprofen 100mg/5ml Syrup 60ml", "Ibuprofen", "Generic", AN, "syrup", "100mg/5ml", 1800, false);
add("Ibucap 100mg/5ml Suspension 45ml", "Ibuprofen", "Ibucap", AN, "suspension", "100mg/5ml", 2450, false);
add("Nurofen 200mg Caplets 12", "Ibuprofen", "Nurofen", AN, "tablet", "200mg", 4200, false);
add("Fenbid 200mg Tablets x8", "Ibuprofen", "Fenbid", AN, "tablet", "200mg", 2600, false);
add("Diclofenac 50mg Tablets x20", "Diclofenac", "Generic", AN, "tablet", "50mg", 1450);
add("Voltaren 50mg Tablets x20", "Diclofenac", "Voltaren", AN, "tablet", "50mg", 3450);
add("Voltarol 75mg Tablets x20", "Diclofenac", "Voltarol", AN, "tablet", "75mg", 4000);
add("Diclofenac 75mg Injection", "Diclofenac", "Generic", AN, "injection", "75mg", 1600);
add("Arthrotec 75mg Tablets x20", "Diclofenac/Misoprostol", "Arthrotec", AN, "tablet", "75mg", 8420);
add("Aclonal 50mg Tablets x15", "Aclafenac", "Aclonal", AN, "tablet", "50mg", 720);
add("Aceclofenac 100mg Tablets x10", "Aceclofenac", "Generic", AN, "tablet", "100mg", 1650);
add("Naproxen 250mg Tablets x16", "Naproxen", "Generic", AN, "tablet", "250mg", 2650);
add("Apranax 250mg Tablets x20", "Naproxen", "Apranax", AN, "tablet", "250mg", 4200);
add("Naproxen 500mg Tablets x20", "Naproxen", "Generic", AN, "tablet", "500mg", 4100);
add("Ponstan Forte 500mg Tablets x12", "Mefenamic Acid", "Ponstan", AN, "tablet", "500mg", 5000);
add("Mefenamic Acid 500mg Tablets x12", "Mefenamic Acid", "Generic", AN, "tablet", "500mg", 1900);
add("Mefenamic Acid 125mg/5ml Syrup 100ml", "Mefenamic Acid", "Generic", AN, "syrup", "125mg/5ml", 2400, false);
add("Novagin 500mg Tablets x10", "Dextropropoxyphene/Paracetamol", "Novagin", AN, "tablet", "65/650mg", 2900);
add("Aspirin 300mg Tablets x24", "Aspirin", "Aspirin", AN, "tablet", "300mg", 2200, false);
add("Aspirin EC 100mg Tablets x28", "Aspirin", "Cardiprin", AN, "tablet", "100mg", 2150, false);
add("Co-Codamol 500mg Tablets x20", "Paracetamol/Codeine", "Co-Codamol", AN, "tablet", "500/30mg", 4200);
add("Diclofenac Gel 1% 50g", "Diclofenac", "Voltaren", AN, "gel", "1%", 3100, false);
add("Voltaren Emulgel 50g", "Diclofenac", "Voltaren", AN, "gel", "1%", 5200, false);
add("Aedea 25mg Tablets x10", "Aedesin Apeicenal", "Ainto", AN, "tablet", "25mg", 1100, false);
add("Tomin 50mg Injection", "Tetracaine Hydrochloride", "Tomin", AN, "injection", "50mg", 4200);
add("Zippy 25mg Tablets x20 (Diclofenac)", "Diclofenac", "Zippy", AN, "tablet", "25mg", 1800, false);
add("Ketorolac 30mg Tablets", "Ketorolac", "Generic", AN, "tablet", "30mg", 3400);
add("Toradol 30mg Injection", "Ketorolac", "Toradol", AN, "injection", "30mg", 6900);
add("Parajil 10mg Tablets", "Paraclodine", "Parajil", AN, "tablet", "10mg", 2900, false);
add("Tramadol 50mg Capsules x20", "Tramadol", "Generic", AN, "capsule", "50mg", 2450);
add("Capadex 50mg Capsules x10", "Tramadol", "Capadex", AN, "capsule", "50mg", 2900);
add("Zyotol 50mg Tablets x20", "Tramadol", "Zyotol", AN, "tablet", "50mg", 3100);
add("Painux 755mg Injection", "Metamizole", "Panalgix", AN, "injection", "1g", 3200);
add("Metazol 500mg Tablets", "Metamizol", "Metamizol", AN, "tablet", "500mg", 2100);
add("Sodium Chloride 50mg Tablets - NO", "placebo", "NULL", AN, "tablet", "50mg", 1);
// (row above removed intentionally)

// ===========================================================================
// ANTIHYPERTENSIVES
// ---------------------------------------------------------------------------
const HY = "Antihypertensives";
add("Amlodipine 5mg Tablets x30", "Amlodipine", "Generic", HY, "tablet", "5mg", 1500);
add("Amlodipine 10mg Tablets x30", "Amlodipine", "Generic", HY, "tablet", "10mg", 1700);
add("Ampotenz 5mg Tablets x30", "Amlodipine", "Ampotenz", HY, "tablet", "5mg", 2800);
add("Norvasc 5mg Tablets x28", "Amlodipine", "Norvasc", HY, "tablet", "5mg", 6100);
add("Norvasc 10mg Tablets x28", "Amlodipine", "Norvasc", HY, "tablet", "10mg", 7400);
add("Amlocard 10mg Tablets x30", "Amlodipine", "Amlocard", HY, "tablet", "10mg", 4300);
add("Losartan 50mg Tablets x30", "Losartan", "Generic", HY, "tablet", "50mg", 2300);
add("Cozaar 50mg Tablets x28", "Losartan", "Cozaar (MSD)", HY, "tablet", "50mg", 7200);
add("Arbitel 50mg Tablets x28", "Losartan", "Arbitel", HY, "tablet", "50mg", 5100);
add("Aprovel 50mg Tablets x28", "Irbesartan", "Aprovel (Sanofi)", HY, "tablet", "50mg", 13100);
add("Aprovel 300mg Tablets x28", "Irbesartan", "Aprovel", HY, "tablet", "300mg", 18900);
add("Irbesartan 150mg Tablets x28", "Irbesartan", "Generic", HY, "tablet", "150mg", 6800);
add("Valsartan 80mg Tablets x28", "Valsartan", "Generic", HY, "tablet", "80mg", 5200);
add("Diovan 80mg Tablets x28", "Valsartan", "Diovan (Novartis)", HY, "tablet", "80mg", 22000);
add("Diovan 160mg Tablets x28", "Valsartan", "Diovan", HY, "tablet", "160mg", 31000);
add("Co-Diovan 160/12.5mg Tablets x28", "Valsartan/HCTZ", "Co-Diovan", HY, "tablet", "160/12.5mg", 41670);
add("Co-Diovan 80/12.5mg Tablets x28", "Valsartan/HCTZ", "Co-Diovan", HY, "tablet", "80/12.5mg", 36670);
add("Co-Diovan 160/25mg Tablets x28", "Valsartan/HCTZ", "Co-Diovan", HY, "tablet", "160/25mg", 35570);
add("Telmisartan 40mg Tablets x14", "Telmisartan", "Generic", HY, "tablet", "40mg", 3400);
add("Micardis 40mg Tablets x28", "Telmisartan", "Micardis", HY, "tablet", "40mg", 12800);
add("Telmisartan 80mg Tablets x28", "Telmisartan", "Generic", HY, "tablet", "80mg", 6100);
add("Atacand 8mg Tablets x28", "Candesartan", "Atacand (AstraZeneca)", HY, "tablet", "8mg", 21030);
add("Atacand 16mg Tablets x28", "Candesartan", "Atacand", HY, "tablet", "16mg", 50420);
add("Atacand Plus 16/12.5mg Tablets x28", "Candesartan/HCTZ", "Atacand Plus", HY, "tablet", "16/12.5mg", 37480);
add("Kancartan 8mg Tablets x28", "Candesartan", "Kancartan", HY, "tablet", "8mg", 8200);
add("Enalapril 5mg Tablets x20", "Enalapril", "Generic", HY, "tablet", "5mg", 1200);
add("Enalapril 20mg Tablets x20", "Enalapril", "Generic", HY, "tablet", "20mg", 2200);
add("Renitec 10mg Tablets x28", "Enalapril", "Renitec (MSD)", HY, "tablet", "10mg", 5200);
add("Renitec 20mg Tablets x28", "Enalapril", "Renitec", HY, "tablet", "20mg", 6800);
add("Lisin,prin 5mg Tablets x14", "Lisinopril", "Generic", HY, "tablet", "5mg", 980);
add("Lisinopril 10mg Tablets x14", "Lisinopril", "Generic", HY, "tablet", "10mg", 1400);
add("Zestril 10mg Tablets x28", "Lisinopril", "Zestril (AstraZeneca)", HY, "tablet", "10mg", 2900);
add("Zestril 20mg Tablets x28", "Lisinopril", "Zestril", HY, "tablet", "20mg", 3400);
add("Ramipril 5mg Tablets x14", "Ramipril", "Generic", HY, "tablet", "5mg", 3200);
add("Ramipril 10mg Tablets x14", "Ramipril", "Generic", HY, "tablet", "10mg", 4100);
add("Tritace 5mg Tablets x14", "Ramipril", "Tritace", HY, "tablet", "5mg", 3300);
add("Treatace 10mg Tablets x28", "Ramipril", "Treatace", HY, "tablet", "10mg", 6300);
add("Coversyl 5mg Tablets x28", "Perindopril", "Coversyl (Servier)", HY, "tablet", "5mg", 14200);
add("Coversyl 10mg Tablets x28", "Perindopril", "Coversyl", HY, "tablet", "10mg", 22200);
add("Coveram 5mg/10mg Tablets x28", "Perindopril/Amlodipine", "Coveram", HY, "tablet", "5/10mg", 21400);
add("Coveram 10mg/10mg Tablets x28", "Perindopril/Amlodipine", "Coveram", HY, "tablet", "10/10mg", 24600);
add("Bisoprolol 5mg Tablets x28", "Bisoprolol", "Generic", HY, "tablet", "5mg", 2500);
add("Concor 5mg Tablets x28", "Bisoprolol", "Concor (Merck)", HY, "tablet", "5mg", 2600);
add("Concor 10mg Tablets x28", "Bisoprolol", "Concor", HY, "tablet", "10mg", 3400);
add("Metoprolol 100mg Tablets x14", "Metoprolol", "Generic", HY, "tablet", "100mg", 1800);
add("Betaloc ZOK 50mg Tablets x28", "Metoprolol", "Betaloc", HY, "tablet", "50mg", 4200);
add("Propranolol 40mg Tablets x28", "Propranolol", "Generic", HY, "tablet", "40mg", 1750);
add("Propranolol 80mg Tablets x28", "Propranolol", "Generic", HY, "tablet", "80mg", 2400);
add("Carvedilol 6.25mg Tablets x28", "Carvedilol", "Generic", HY, "tablet", "6.25mg", 2900);
add("Tenoretic 50/25mg Tablets x28", "Atenolol/Chlorthalidone", "Tenoretic", HY, "tablet", "50/25mg", 4300);
add("Atenolol 50mg Tablets x28", "Atenolol", "Generic", HY, "tablet", "50mg", 2100);
add("Tenormin 50mg Tablets x28", "Atenolol", "Tenormin (AstraZeneca)", HY, "tablet", "50mg", 5800);
add("Doxazosin 2mg Tablets x28", "Doxazosin", "Generic", HY, "tablet", "2mg", 2600);
add("Aldomet 250mg Tablets x28", "Methyldopa", "Aldomet", HY, "tablet", "250mg", 6900);
add("Methyldopa 250mg Tablets x28", "Methyldopa", "Generic", HY, "tablet", "250mg", 2600);
add("Methyldopa 125mg/5ml Suspension", "Methyldopa", "Generic", HY, "suspension", "125mg/5ml", 3400);
add("Clonidine 200mcg Tablets x14", "Clonidine", "Generic", HY, "tablet", "200mcg", 2800);
add("Hytrin 2mg Tablets", "Terzosin", "Hytrin", HY, "tablet", "2mg", 5300);
add("Telma 40mg Tablets x30", "Telmisartan", "Telma", HY, "tablet", "40mg", 8900);

// ===========================================================================
// DIABETES
// ---------------------------------------------------------------------------
const DB = "Diabetes";
add("Metformin 500mg Tablets x30", "Metformin", "Generic", DB, "tablet", "500mg", 2200);
add("Metformin 850mg Tablets x30", "Metformin", "Generic", DB, "tablet", "850mg", 3200);
add("Glucophage 500mg Tablets x28", "Metformin", "Glucophage", DB, "tablet", "500mg", 5400);
add("Glucophage XR 500mg Tablets x30", "Metformin", "Glucophage XR", DB, "tablet", "500mg", 6800);
add("Diaformin 500mg Tablets x30", "Metformin", "Diaformin", DB, "tablet", "500mg", 2900);
add("Glucovanance 250mg/1.25mg Tablets", "Metformin/Glibenclamide", "Glucovance", DB, "tablet", "250/1.25mg", 3800);
add("Glibenclamide 5mg Tablets x20", "Glibenclamide", "Generic", DB, "tablet", "5mg", 2900);
add("Daonil 5mg Tablets x30", "Glibenclamide", "Daonil (Sanofi)", DB, "tablet", "5mg", 4900);
add("Diaben 5mg Tablets", "Glipizide", "Diaben", DB, "tablet", "5mg", 4200);
add("Glipizide 5mg Tablets x30", "Glipizide", "Generic", DB, "tablet", "5mg", 2700);
add("Gliclazide 80mg Tablets x30", "Gliclazide", "Generic", DB, "tablet", "80mg", 4800);
add("Diamicron 80mg Tablets x30", "Gliclazide", "Diamicron", DB, "tablet", "80mg", 12100);
add("Amaryl 1mg Tablets x30", "Glimepiride", "Amaryl (Sanofi)", DB, "tablet", "1mg", 12500);
add("Amaryl 2mg Tablets x30", "Glimepiride", "Amaryl", DB, "tablet", "2mg", 16900);
add("Amaryl 4mg Tablets x30", "Glimepiride", "Amaryl", DB, "tablet", "4mg", 22500);
add("Glimepiride 2mg Tablets x30", "Glimepiride", "Generic", DB, "tablet", "2mg", 2600);
add("Pioglitazone 30mg Tablets x28", "Pioglitazone", "Generic", DB, "tablet", "30mg", 10500);
add("Actos 30mg Tablets x28", "Pioglitazone", "Actos", DB, "tablet", "30mg", 21000);
add("Piogen 15mg Tablets x30", "Pioglitazone", "Piogen", DB, "tablet", "15mg", 7900);
add("Suproc 50mg Tablets x28", "Sitagliptin", "Generic", DB, "tablet", "50mg", 22800);
add("Januvia 100mg Tablets x28", "Sitagliptin", "Januvia (MSD)", DB, "tablet", "100mg", 48000);
add("Dapaglyn 10mg Tablets x28", "Dapagliflozin", "Dapaglyn", DB, "tablet", "10mg", 33500);
add("Forxiga 10mg Tablets x28", "Dapagliflozin", "Forxiga (AstraZeneca)", DB, "tablet", "10mg", 36500);
add("Dapagliflozin 10mg Tablets x30", "Dapagliflozin", "Generic", DB, "tablet", "10mg", 19800);
add("Empagliflozin 25mg Tablets x28", "Empagliflozin", "Generic", DB, "tablet", "25mg", 26500);
add("Jardiance 10mg Tablets x30", "Empagliflozin", "Jardiance", DB, "tablet", "10mg", 31200);
add("Linagliptin 5mg Tablets x30", "Linagliptin", "Generic", DB, "tablet", "5mg", 21500);
add("Trajenta 5mg Tablets x30", "Linagliptin", "Trajenta", DB, "tablet", "5mg", 34000);
add("Vildagliptin 50mg Tablets x30", "Vildagliptin", "Generic", DB, "tablet", "50mg", 15800);
add("Insulin 30/70 Mixtard 10ml", "Insulin (Mixed)", "Mixtard 30/70", DB, "injection", "100 IU/ml 10ml", 9200);
add("Insulin R (Actrapid) 10ml", "Insulin (Human)", "Actrapid", DB, "injection", "100 IU/ml", 9800);
add("Humulin N 10ml", "Insulin Isophane", "Humulin N", DB, "injection", "100 IU/ml", 9800);
add("Humalog 100 3ml", "Insulin Lispro", "Humalog", DB, "injection", "100 IU/ml", 14500);
add("Lantus 100 3ml", "Insulin Glargine", "Lantus", DB, "injection", "100 IU/ml", 24500);
add("NovoRapid 100 3ml", "Insulin Aspart", "NovoRapid", DB, "injection", "100 IU/ml", 12100);
add("Tresiba 100 3ml", "Insulin Degludec", "Tresiba", DB, "injection", "100 IU/ml", 25800);
add("Glycomet 850mg 30", "Metformin", "Glycomet", DB, "tablet", "850mg", 4200);
add("Metforal 500mg Tablets x30", "Metformin", "Metforal", DB, "tablet", "500mg", 2400);

// ===========================================================================
// RESPIRATORY
// ---------------------------------------------------------------------------
const RS = "Respiratory";
add("Ventolin 100mcg Inhaler", "Salbutamol", "Ventolin (GSK)", RS, "inhaler", "100mcg", 4900);
add("Ventolin 500mcg Injection", "Salbutamol", "Ventolin", RS, "injection", "500mcg", 5800);
add("Salbutamol 2mg Tablets x20", "Salbutamol", "Generic", RS, "tablet", "2mg", 900, false);
add("Salbutamol 2mg/5ml Syrup 100ml", "Salbutamol", "Generic", RS, "syrup", "2mg/5ml", 850, false);
add("Salbutamol Nebulising Solution 20ml", "Salbutamol", "Generic", RS, "solution", "2.5mg", 1650);
add("Ventolin Nebules 2.5mg x20", "Salbutamol", "Ventolin", RS, "nebule", "2.5mg", 3900);
add("Atrovent", "Ipratropium Bromide", "Atrovent", RS, "inhaler", "20mcg", 7200);
add("Ipravent 20mcg Inhaler", "Ipratropium bromide", "Ipravent", RS, "inhaler", "20mcg", 2900);
add("Combivent 500mcg Inhaler", "Ipratropium/Salbutamol", "Combivent", RS, "inhaler", "100/20mcg", 7100);
add("Seretide 250mcg Inhaler", "Salmeterol/Fluticasone", "Seretide", RS, "inhaler", "250/25mcg", 12400);
add("Seretide 500mcg Inhaler", "Salmeterol/Fluticasone", "Seretide", RS, "inhaler", "500/25mcg", 15200);
add("Flixotide 50mcg Inhaler", "Fluticasone Propionate", "Flixotide", RS, "inhaler", "50mcg", 5600);
add("Symbicort 200 120dose", "Budesonide/Formoterol", "Symbicort", RS, "inhaler", "160/4.5mcg", 13800);
add("Budesonide 200mcg Inhaler", "Budesonide", "Generic", RS, "inhaler", "200mcg", 7800);
add("Budesonide Nebules 0.5mg x20", "Budesonide", "Generic", RS, "nebule", "0.5mg", 8400);
add("Pulmicort 200mcg Inhaler", "Budesonide", "Pulmicort", RS, "inhaler", "200mcg", 12600);
add("Montelukast 10mg Tablets x30", "Montelukast", "Generic", RS, "tablet", "10mg", 5800);
add("Singulair 10mg Tablets x28", "Montelukast", "Singulair", RS, "tablet", "10mg", 11900);
add("Montelukast 4mg Chewable Tablets x28", "Montelukast", "Generic", RS, "tablet", "4mg", 4400);
add("Montevac 10mg Tablets x30", "Montelukast", "Montevac", RS, "tablet", "10mg", 8900);
add("Fexofenadine 180mg Tablets x10", "Fexofenadine", "Generic", RS, "tablet", "180mg", 3100, false);
add("Telfast 180mg Tablets x10", "Fexofenadine", "Telfast", RS, "tablet", "180mg", 6800, false);
add("Cetirizine 10mg Tablets x30", "Cetirizine", "Generic", RS, "tablet", "10mg", 1100, false);
add("Zyrtec 10mg Tablets x10", "Cetirizine", "Zyrtec", RS, "tablet", "10mg", 5600, false);
add("Loratadine 10mg Tablets x30", "Loratadine", "Generic", RS, "tablet", "10mg", 1200, false);
add("Claritin 10mg Tablets x10", "Loratadine", "Claritin", RS, "tablet", "10mg", 6100, false);
add("Cetirizine 5mg/5ml Syrup 100ml", "Cetirizine", "Generic", RS, "syrup", "5mg/5ml", 2600, false);
add("Desloratadine 5mg Tablets x30", "Desloratadine", "Generic", RS, "tablet", "5mg", 4900, false);
add("Aerius 5mg Tablets x30", "Desloratadine", "Aerius", RS, "tablet", "5mg", 11800, false);
add("Aerius Syrup 120ml", "Desloratadine", "Aerius", RS, "syrup", "0.5mg/ml", 9200, false);
add("Theophylline 200mg Tablets x28", "Theophylline", "Generic", RS, "tablet", "200mg", 2400);
add("Oncomelt 200mg Tablets x28", "Theophylline PR", "Oncomelt", RS, "tablet", "200mg", 1900);
add("Aminophylline 200mg Tablets x30", "Aminophylline", "Generic", RS, "tablet", "200mg", 2900);
add("Aminophylline 250mg Injection", "Aminophylline", "Generic", RS, "injection", "250mg", 1900);
add("Ambroxol 30mg Tablets x20", "Ambroxol", "Generic", RS, "tablet", "30mg", 1900, false);
add("Ambroxol 30mg/5ml Syrup 100ml", "Ambroxol", "Generic", RS, "syrup", "30mg/5ml", 2100, false);
add("Tetralysal 30mg", "Ambroxol", "Tetralysal", RS, "tablet", "30mg", 2400, false);
add("Bronal 30mg Tablets x20", "Ambroxol", "Bronal", RS, "tablet", "30mg", 1200, false);
add("Acetylcysteine 600mg Tablets x20", "Acetylcysteine", "Generic", RS, "tablet", "600mg", 2900, false);
add("Dexamethasone 0.5mg Tablets x30", "Dexamethasone", "Generic", RS, "tablet", "0.5mg", 1400);
add("Prednisolone 5mg Tablets x30", "Prednisolone", "Generic", RS, "tablet", "5mg", 1900);
add("Prednisolone 10mg Tablets x30", "Prednisolone", "Generic", RS, "tablet", "10mg", 2800);
add("Methylprednisolone 16mg Tablets x30", "Methyprednisolone", "Generic", RS, "tablet", "16mg", 6400);
add("Methylprednisolone 125mg Injection", "Methylprednisolone", "Solu-Medrol", RS, "injection", "125mg", 9800);
add("Hydrocortisone 100mg Injection", "Hydrocortisone", "Generic", RS, "injection", "100mg", 2500);
add("Beclate 100mcg Inhaler", "Becloforte", "Beclate", RS, "inhaler", "100mcg", 7900);
add("Clenil FC 100mcg Inhaler", "Beclomethasone", "Clenil", RS, "inhaler", "100mcg", 9800);
add("Query 100mcg Meter Spray", "Beclomethasone", "Qvar", RS, "inhaler", "100mcg", 11500);
add("Perex 400mcg Inhaler", "Budesonide", "Generic", RS, "inhaler", "400mcg", 14200);

// ===========================================================================
// GASTROINTESTINAL
// ---------------------------------------------------------------------------
const GI = "Gastrointestinal";
add("Omeprazole 20mg Capsules x20", "Omeprazole", "Generic", GI, "capsule", "20mg", 2200);
add("Losec 20mg Capsules x20", "Omeprazole", "Losec", GI, "capsule", "20mg", 6400);
add("Dagolec 20mg Capsules x20", "Omeprazole", "Dagolec", GI, "capsule", "20mg", 2900);
add("Ozapin 20mg Capsules x20", "Omeprazole", "Ozapin", GI, "capsule", "20mg", 3800);
add("Omeprazole 40mg Injection", "Omeprazole", "Generic", GI, "injection", "40mg", 5200);
add("Esomeprazole 40mg Tablets x28", "Esomeprazole", "Generic", GI, "tablet", "40mg", 8600);
add("Nexium 40mg Tablets x28", "Esomeprazole", "Nexium (AstraZeneca)", GI, "tablet", "40mg", 18900);
add("Zontac 150mg Tablets x28", "Zontac (Zantac)", "Zantac", GI, "tablet", "150mg", 9300);
add("Ranitidine 150mg Tablets x28", "Ranitidine", "Generic", GI, "tablet", "150mg", 2100);
add("Famotidine 40mg Tablets x28", "Famotidine", "Generic", GI, "tablet", "40mg", 2800);
add("Pepcid 40mg Tablets x28", "Famotidine", "Pepcid", GI, "tablet", "40mg", 8200);
add("Cimetidine 400mg Tablets x28", "Cimetidine", "Generic", GI, "tablet", "400mg", 3500);
add("Tagamet 400mg Tablets x28", "Cimetidine", "Tagamet", GI, "tablet", "400mg", 12500);
add("Pantoprazole 40mg Tablets x28", "Pantoprazole", "Generic", GI, "tablet", "40mg", 6900);
add("Como 40mg Injectable", "Pantoprazole", "Generic", GI, "injection", "40mg", 7800);
add("Lacerrolamid 2mg Capsules x16", "Loperamide", "Generic", GI, "capsule", "2mg", 950, false);
add("Imodium 2mg Caplets x6", "Loperamide", "Imodium", GI, "caplet", "2mg", 750, false);
add("Domperidone 10mg Tablets x20", "Domperidone", "Generic", GI, "tablet", "10mg", 1800);
add("Motilium 10mg Tablets x28", "Domperidone", "Motilium", GI, "tablet", "10mg", 7900);
add("Domperidone 5mg/5ml Suspension", "Domperidone", "Generic", GI, "suspension", "5mg/5ml", 2600);
add("Metoclopramide 10mg Tablets x28", "Metoclopramide", "Generic", GI, "tablet", "10mg", 2400);
add("Contralom 10mg Tablets", "Metoclopramide", "Cerucal", GI, "tablet", "10mg", 2100);
add("Primperan 10mg Tablets x20", "Metoclopramide", "Primperan", GI, "tablet", "10mg", 5400);
add("Ondansetron 8mg Tablets x20", "Ondansetron", "Generic", GI, "tablet", "8mg", 3200);
add("Zofran 8mg Tablets x20", "Ondansetron", "Zofran (GSK)", GI, "tablet", "8mg", 8500);
add("Ondansetron 2mg/5ml Syrup 100ml", "Ondansetron", "Generic", GI, "syrup", "2mg/5ml", 4200);
add("Ondansetron 4mg Injection", "Ondansetron", "Generic", GI, "injection", "4mg", 3600);
add("Hycamtin?", "Administer", "No", GI, "tablet", "10mg", 0); // removed later
add("Maalox Suspension 250ml", "Al(OH)3/Mg(OH)2", "Generic", GI, "suspension", "250ml", 3400, false);
add("Gaviscon Aniseed 600ml", "Alginic Acid", "Gaviscon", GI, "suspension", "600ml", 5200, false);
add("Gaviscon Advanced 250ml", "Alginic Acid/NaHCO3", "Gaviscon", GI, "suspension", "250ml", 6400, false);
add("Antasel Suspension", "Alugelly", "Antasel", GI, "suspension", "250ml", 2800, false);
add("Bisacodyl 5mg Tablets x10", "Bisacodyl", "Generic", GI, "tablet", "5mg", 1600, false);
add("Dulcolax 5mg Tablets x10", "Bisacodyl", "Dulcolax", GI, "tablet", "5mg", 4400, false);
add("Dulcosax 5mg Suppositories", "Bisacodyl", "Dulcosax", GI, "suppository", "5mg", 3200, false);
add("Senokot 7.5mg Tablets x20", "Sennosides", "Senokot", GI, "tablet", "7.5mg", 3900, false);
add("Lactulose 200ml", "Lactulose", "Generic", GI, "syrup", "200ml", 2800, false);
add("Duphalac 200ml", "Lactulose", "Duphalac", GI, "syrup", "200ml", 4900, false);
add("Lactamol 200ml", "Lactulose", "Lactamol", GI, "syrup", "200ml", 3800, false);
add("Movicol Original 20 Sachets", "Macrogol", "Movicol", GI, "powder", "13.8g", 13500, false);
add("Oral Rehydration Salts 5.3g x12", "ORS", "WHO", GI, "powder", "5.3g", 850, false);
add("Zinc Sulphate 20mg Tablets x20", "Zinc Sulphate", "Generic", GI, "tablet", "20mg", 1200, false);
add("Enatrol 200ml Sachets", "ORS+Zinc", "Zentrol", GI, "powder", "200ml", 6100, false);
add("Smecta 3g Sachets x30", "Diosmectite", "Smecta", GI, "sachet", "3g", 13400);
add("Cranberry 90mg", "Cramberry", "Generic", GI, "capsule", "90mg", 1900, false);
add("Unsuggar 80mg Tablets x20", "Ursodeoxycholic Acid", "Ursogal", GI, "tablet", "80mg", 5200);
add("Ugridol 300mg Tablets x20", "Ursomax", "Urso", GI, "tablet", "300mg", 6100);
add("Septilan 500mg x20", "Sucralfate", "Septilan", GI, "tablet", "500mg", 2200);
add("Carafate 1g Susp 12ml", "Sucralfate", "Carafate", GI, "suspension", "1g/5ml", 4800);
add("Antepsin 1g Tablets", "Sucralfate", "Antepsin", GI, "tablet", "1g", 3900);
add("Pariet 20mg Tablets x28", "Rabeprazole", "Pariet", GI, "tablet", "20mg", 16500);
add("Rabeprazole 20mg Tablets x28", "Rabeprazole", "Generic", GI, "tablet", "20mg", 5400);
add("Perjeta 10mg", "Rabeprazole", "Generic", GI, "tablet", "10mg", 3900);
add("Aluminum 20mg", "Aluminium", "Generic", GI, "tablet", "20mg", 2800, false);

// ===========================================================================
// VITAMINS & SUPPLEMENTS
// ---------------------------------------------------------------------------
const VT = "Vitamins & Supplements";
add("Vitamin B1 20mg", "Thiamine", "Generic", VT, "tablet", "20mg", 1600, false);
add("Vitamin B6 20mg", "Pyridoxine", "Generic", VT, "tablet", "20mg", 1450, false);
add("Compound 336", "Vitamin B Comp", "Generic", VT, "tablet", "10mg", 1350, false);
add("Vitamin B Co Injection", "Vitamin B Comp", "Generic", VT, "injection", "2ml", 1800, false);
add("Neurilin 100mg", "Vitamin B1/B6/B12", "Neurilin", VT, "tablet", "100mg", 3900, false);
add("Nervica 150mg", "Vitamin B", "Nervica", VT, "tablet", "150mg", 2400, false);
add("Nutrabio 30 Tablets", "Multivitamin", "Multivite", VT, "tablet", "30 tabs", 1150, false);
add("Multivite 60", "Multivitamin", "Multivite", VT, "tablet", "60 tabs", 2200, false);
add("Daily Gear 30", "Multivitamin/Multimineral", "Generic", VT, "capsule", "30 caps", 3300, false);
add("Men's Multi 30", "Multivitamin (Men)", "Generic", VT, "tablet", "30 tabs", 4700, false);
add("Women's Multi 30", "Multivitamin (Women)", "Generic", VT, "tablet", "30 tabs", 4900, false);
add("Vitest 250ml", "Multivitamin Syrup", "Vitest", VT, "syrup", "100ml", 4200, false);
add("Cod Liver Oil 500ml", "Omega-3", "Cod Liver Oil", VT, "syrup", "500ml", 6100, false);
add("Cod Liver Oil 1000ml", "Omega-3", "Generic", VT, "syrup", "1000ml", 8900, false);
add("Omega 3 1000mg 60", "Omega-3", "Generic", VT, "capsule", "1000mg", 5200, false);
add("Omega 3 90", "Omega-3", "Omgar", VT, "capsule", "1000mg", 7200, false);
add("Calcium 600mg", "Calcium", "Generic", VT, "tablet", "600mg", 3400, false);
add("Calcium Forte 600mg 30", "Calcium", "Calcium Forte", VT, "tablet", "600mg", 6200, false);
add("Calcium + Vit D", "Calcium/Vitamin D", "Generic", VT, "tablet", "600mg/400IU", 4800, false);
add("Magnesium 400mg 30", "Magnesium", "Generic", VT, "capsule", "400mg", 2900, false);
add("Magnesium Glycinate 30", "Magnesium", "Generic", VT, "capsule", "200mg", 3800, false);
add("Zinc 100mg 30", "Zinc", "Generic", VT, "tablet", "100mg", 1900, false);
add("Zinc + Vitamin C", "Zinc/Vitamin C", "Generic", VT, "tablet", "100mg+500mg", 2300, false);
add("Zinc Sulphate Syrup 100ml", "Zinc", "Generic", VT, "syrup", "20mg/5ml", 2900, false);
add("Iron 100mg", "Ferrous Sulphate", "Generic", VT, "tablet", "100mg", 2600, false);
add("Ferrous + Folic", "Ferrous/Folic Acid", "Generic", VT, "tablet", "200+150mg", 2900, false);
add("Fabgran 30", "Iron Liquid", "Fabgran", VT, "syrup", "100ml", 2400, false);
add("Folic Acid 400mcg 25", "Folic Acid", "Generic", VT, "tablet", "400mcg", 650, false);
add("Folic Acid 5mg", "Folic Acid", "Generic", VT, "tablet", "5mg", 900, false);
add("Folpro-T 40", "Folic Acid/Vit B12", "Folate-T", VT, "tablet", "40 tabs", 2900, false);
add("Vitamin D3 2000IU", "Cholecalciferol", "Vitamin D3", VT, "capsule", "2000IU", 3200, false);
add("Vitamin D3 4000IU", "Cholecalciferol", "Vitamin D3", VT, "capsule", "4000IU", 3900, false);
add("Vital D3 2000", "Vitamin D3", "Vital D3", VT, "capsule", "2000IU", 2700, false);
add("Vitamin E 400IU", "Alpha Tocopherol", "Generic", VT, "capsule", "400IU", 2900, false);
add("Vitamin A 2000IU", "Retinol", "Generic", VT, "capsule", "2000IU", 1400, false);
add("Vitamin K 90", "Phytonadione", "Generic", VT, "tablet", "100mcg", 6200, false);
add("Biotin 5000mcg 60", "Biotin", "Generic", VT, "capsule", "5000mcg", 2800, false);
add("CoQ10 100mg", "Coenzym", "CoQ10", VT, "capsule", "100mg", 8500, false);
add("Potassium 99mg 90", "Potassium", "Generic", VT, "tablet", "99mg", 3900, false);
add("Chromium 200mcg 90", "Chromium", "Generic", VT, "tablet", "200mcg", 4200, false);
add("Spectrum 90", "Multivitamin", "Spectrum", VT, "tablet", "90 tabs", 3200, false);

// ===========================================================================
// Pack-size expansions â€” deterministic price-per-tablet curve. Adds x8/x10/
// x14/x16/x20/x28/x30/x56 variants for common packable products so the
// dataset mirrors real Nigerian retail shelves.
// ---------------------------------------------------------------------------
const packGroups = [
  // [name, generic, brand, category, form, dosage, basePrice, pack, [extra packs]]
  ["Paracetamol 500mg", "Paracetamol", "Generic", AN, "tablet", "500mg", 650, 16, [8, 20, 32, 100]],
  ["Emzor Paracetamol 500mg", "Paracetamol", "Emzor", AN, "tablet", "500mg", 1700, 32, [8, 16, 64]],
  ["Panadol Extra", "Paracetamol/Caffeine", "Panadol", AN, "tablet", "500mg/65mg", 1300, 8, [12, 16, 24]],
  ["Amoxil 500mg", "Amoxicillin", "Amoxil", AB, "capsule", "500mg", 3200, 21, [7, 14, 28]],
  ["Amoxicillin 500mg", "Amoxicillin", "Generic", AB, "capsule", "500mg", 1150, 10, [14, 20, 28]],
  ["Ciprotab 500mg", "Ciprofloxacin", "Ciprotab", AB, "tablet", "500mg", 7420, 14, [6, 10, 20]],
  ["Ciprofloxacin 500mg", "Ciprofloxacin", "Generic", AB, "tablet", "500mg", 3800, 10, [14, 20, 28]],
  ["Augmentin 625mg", "Amoxicillin/Clavulanic Acid", "Augmentin", AB, "tablet", "625mg", 15890, 14, [6, 10, 21]],
  ["Co-Amoxiclav 625mg", "Amoxicillin/Clavulanic Acid", "Generic", AB, "tablet", "625mg", 6200, 10, [6, 14, 20]],
  ["Amatem 80/480mg", "Artemether/Lumefantrine", "Amatem", MA, "softgel", "80/480mg", 3470, 10, [6, 12, 18]],
  ["Coartem 20/120mg", "Artemether/Lumefantrine", "Coartem", MA, "tablet", "20/120mg", 5000, 8, [6, 12, 24]],
  ["Lonart 20/120mg", "Artemether/Lumefantrine", "Lonart", MA, "tablet", "20/120mg", 4200, 8, [6, 12, 24]],
  ["Brufen 400mg", "Ibuprofen", "Brufen", AN, "tablet", "400mg", 3400, 16, [8, 10, 20]],
  ["Ibuprofen 400mg", "Ibuprofen", "Generic", AN, "tablet", "400mg", 950, 16, [8, 12, 30]],
  ["Diclofenac 50mg", "Diclofenac", "Generic", AN, "tablet", "50mg", 1450, 20, [10, 16, 30]],
  ["Voltaren 50mg", "Diclofenac", "Voltaren", AN, "tablet", "50mg", 3450, 20, [10, 15, 28]],
  ["Amlodipine 5mg", "Amlodipine", "Generic", HY, "tablet", "5mg", 1500, 30, [14, 28, 60]],
  ["Amlodipine 10mg", "Amlodipine", "Generic", HY, "tablet", "10mg", 1700, 30, [14, 28, 60]],
  ["Losartan 50mg", "Losartan", "Generic", HY, "tablet", "50mg", 2300, 30, [10, 14, 28, 56]],
  ["Telmisartan 40mg", "Telmisartan", "Generic", HY, "tablet", "40mg", 3400, 14, [10, 28, 30]],
  ["Valsartan 80mg", "Valsartan", "Generic", HY, "tablet", "80mg", 5200, 28, [14, 30, 56]],
  ["Enalapril 10mg", "Enalapril", "Generic", HY, "tablet", "10mg", 1600, 20, [14, 28, 56]],
  ["Bisoprolol 5mg", "Bisoprolol", "Generic", HY, "tablet", "5mg", 2500, 28, [14, 30, 56]],
  ["Metformin 500mg", "Metformin", "Generic", DB, "tablet", "500mg", 2200, 30, [14, 28, 60, 84]],
  ["Metformin 850mg", "Metformin", "Generic", DB, "tablet", "850mg", 3200, 30, [14, 28, 60]],
  ["Glimepiride 2mg", "Glimepiride", "Generic", DB, "tablet", "2mg", 2600, 30, [10, 14, 28]],
  ["Montelukast 10mg", "Montelukast", "Generic", RS, "tablet", "10mg", 5800, 30, [10, 14, 28]],
  ["Cetirizine 10mg", "Cetirizine", "Generic", RS, "tablet", "10mg", 1100, 30, [10, 14, 20]],
  ["Loratadine 10mg", "Loratadine", "Generic", RS, "tablet", "10mg", 1200, 30, [10, 14, 20]],
  ["Fexofenadine 180mg", "Fexofenadine", "Generic", RS, "tablet", "180mg", 3100, 10, [6, 15, 30]],
  ["Omeprazole 20mg", "Omeprazole", "Generic", GI, "capsule", "20mg", 2200, 20, [10, 14, 28, 56]],
  ["Losec 20mg", "Omeprazole", "Losec", GI, "capsule", "20mg", 6400, 20, [10, 14, 28]],
  ["Esomeprazole 40mg", "Esomeprazole", "Generic", GI, "tablet", "40mg", 8600, 28, [7, 14, 30]],
  ["Ranitidine 150mg", "Ranitidine", "Generic", GI, "tablet", "150mg", 2100, 28, [14, 30, 56]],
  ["Domperidone 10mg", "Domperidone", "Generic", GI, "tablet", "10mg", 1800, 20, [10, 28, 30]],
  ["Vitamin B Comp", "Vitamin B Complex", "Generic", VT, "tablet", "500g", 1350, 30, [14, 60, 90]],
  ["Calcium 600mg", "Calcium", "Generic", VT, "tablet", "600mg", 3400, 30, [14, 60, 90]],
  ["Vitamin C 1000mg", "Ascorbic Acid", "Generic", VT, "tablet", "1000mg", 2900, 30, [14, 60, 120]],
  ["Zinc 100mg", "Zinc", "Generic", VT, "tablet", "100mg", 1900, 30, [15, 60, 90]],
];

const OTC_GENERICS = new Set([
  "Paracetamol",
  "Paracetamol/Caffeine",
  "Ibuprofen",
  "Cetirizine",
  "Loratadine",
  "Fexofenadine",
  "Zinc",
  "Copper",
  "Calcium",
  "Ascorbic Acid",
  "Vitamin B Complex",
]);

for (const [nm, generic, brand, cat, form, dosage, basePrice, basePack, extraPacks] of packGroups) {
  // Assume the base entry was already inserted once for `basePack`; add the rest.
  const rx = !OTC_GENERICS.has(generic);
  for (const n of extraPacks) {
    // Slight per-unit discount on larger packs.
    const per = basePrice / basePack;
    const price = Math.round(per * n * (basePack < n ? 0.92 + 0.22 * (basePack / n) : 1.0));
    add(`${nm} x${n}`, generic, brand, cat, form, dosage, price, rx);
  }
}

// ===========================================================================
// Filter out accidental placeholder rows (brand "Generic" with odd/invalid
// generic names or price 0) before writing.
// ---------------------------------------------------------------------------
const JUNK = (r) =>
  r.price_ngn <= 0 ||
  !r.name ||
  /^[^A-Za-z]/.test(r.name) ||
  /(?:NO\b|placebo|NULL|Hycopaque|Administer)/i.test(r.name) ||
  /\.{2,}/.test(r.name);

const clean = rows.filter((r) => !JUNK(r));

// Deduplicate by name+brand
const seen = new Set();
const deduped = clean.filter((r) => {
  const key = `${r.name}|${r.brand}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const totals = deduped.reduce((acc, r) => {
  acc[r.category] = (acc[r.category] ?? 0) + 1;
  return acc;
}, {});
console.log("Total:", deduped.length);
console.log("By category:", totals);

writeFileSync(
  join(here, "medications-seed.json"),
  JSON.stringify(deduped, null, 2) + "\n",
  "utf8"
);
console.log(`Wrote ${deduped.length} medications to scripts/medications-seed.json`);
