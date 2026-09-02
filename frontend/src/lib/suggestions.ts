export const INDUSTRY_OPTIONS = [
  "Any",
  "Technology",
  "Finance",
  "Commerce / Retail",
  "BPO / Customer Support",
  "Sales",
  "Operations / HR",
] as const;

export type IndustryOption = (typeof INDUSTRY_OPTIONS)[number];

const TECH_ROLES = [
  "Agentic AI Engineer",
  "AI Agent Engineer",
  "AI Engineer",
  "LLM Engineer",
  "Generative AI Engineer",
  "ML Engineer",
  "MLOps Engineer",
  "Applied AI Scientist",
  "Prompt Engineer",
  "Computer Vision Engineer",
  "NLP Engineer",
  "AI Solutions Architect",
  "Machine Learning Engineer",
  "Data Scientist",
  "Data Engineer",
  "Analytics Engineer",
  "AI Research Engineer",
  "AI Product Manager",
  "Software Engineer",
  "Software Developer",
  "Senior Software Engineer",
  "Staff Software Engineer",
  "Full Stack Developer",
  "Full Stack Engineer",
  "Backend Engineer",
  "Backend Developer",
  "Frontend Engineer",
  "Frontend Developer",
  "Python Developer",
  "Java Developer",
  "Platform Engineer",
  "DevOps Engineer",
  "Site Reliability Engineer",
  "Cloud Engineer",
  "Solutions Architect",
  "Security Engineer",
  "Mobile Engineer",
  "iOS Engineer",
  "Android Engineer",
  "Product Manager",
  "Technical Program Manager",
  "QA Engineer",
  "Automation Engineer",
  "Robotics Engineer",
  "Embedded Software Engineer",
  "Founding Engineer",
  "Growth Engineer",
  "Engineering Manager",
  "Data Analyst",
];

const FINANCE_ROLES = [
  "Accountant",
  "Junior Accountant",
  "Senior Accountant",
  "Accounts Executive",
  "Accounts Assistant",
  "Accounts Payable Executive",
  "Accounts Receivable Executive",
  "Billing Executive",
  "Invoice Executive",
  "Financial Analyst",
  "Finance Executive",
  "Finance Manager",
  "Assistant Finance Manager",
  "Audit Associate",
  "Internal Auditor",
  "Statutory Auditor",
  "Tax Consultant",
  "Tax Executive",
  "GST Executive",
  "Indirect Tax Executive",
  "Chartered Accountant",
  "CA Articled Assistant",
  "Cost Accountant",
  "Credit Analyst",
  "Credit Officer",
  "Treasury Analyst",
  "Investment Analyst",
  "Equity Research Analyst",
  "Mutual Fund Advisor",
  "Wealth Manager",
  "Banking Officer",
  "Probationary Officer",
  "Relationship Manager",
  "Personal Banker",
  "Loan Officer",
  "Home Loan Officer",
  "Collections Executive",
  "Recovery Officer",
  "Insurance Advisor",
  "Insurance Underwriter",
  "Claims Executive",
  "Payroll Executive",
  "Bookkeeper",
];

const COMMERCE_ROLES = [
  "Sales Executive",
  "Sales Associate",
  "Sales Coordinator",
  "Sales Officer",
  "Retail Sales Executive",
  "Counter Sales Executive",
  "Showroom Sales Executive",
  "Business Development Executive",
  "Business Development Manager",
  "Merchandiser",
  "Visual Merchandiser",
  "Assistant Merchandiser",
  "Fashion Merchandiser",
  "Retail Merchandiser",
  "Category Executive",
  "Category Manager",
  "Brand Executive",
  "Brand Manager",
  "Purchase Executive",
  "Purchase Manager",
  "Buyer",
  "Sourcing Executive",
  "Vendor Development Executive",
  "Inventory Executive",
  "Inventory Controller",
  "Stock Executive",
  "Warehouse Executive",
  "Warehouse Manager",
  "Store Keeper",
  "Store Incharge",
  "Store Manager",
  "Assistant Store Manager",
  "Department Manager",
  "Floor Manager",
  "Retail Manager",
  "Retail Operations Executive",
  "Area Sales Manager",
  "Regional Sales Manager",
  "FMCG Sales Executive",
  "FMCG Sales Officer",
  "Distributor Sales Executive",
  "Wholesale Executive",
  "Supply Chain Executive",
  "Supply Chain Analyst",
  "Supply Chain Manager",
  "Logistics Executive",
  "Logistics Coordinator",
  "Logistics Manager",
  "Dispatch Executive",
  "Transport Coordinator",
  "Import Executive",
  "Export Executive",
  "EXIM Executive",
  "Documentation Executive",
  "Shipping Coordinator",
  "Freight Forwarding Executive",
  "Customs Executive",
  "Operations Executive",
  "Back Office Executive",
  "Commercial Executive",
  "Commercial Officer",
  "E-commerce Executive",
  "E-commerce Catalog Executive",
  "Marketplace Executive",
  "Amazon / Flipkart Executive",
  "Order Processing Executive",
  "Customer Success Executive",
  "Trade Marketing Executive",
  "Channel Partner Executive",
  "Procurement Analyst",
  "Demand Planner",
  "Production Planner",
  "Quality Control Executive",
  "Packaging Executive",
];

const BPO_ROLES = [
  "Customer Support Associate",
  "Customer Service Executive",
  "Customer Care Executive",
  "Call Center Agent",
  "Call Center Executive",
  "Inbound Voice Executive",
  "Outbound Voice Executive",
  "Technical Support Associate",
  "IT Helpdesk Executive",
  "Chat Support Executive",
  "Email Support Executive",
  "Social Media Support Executive",
  "Voice Process Executive",
  "Non-Voice Process Associate",
  "International Voice Process",
  "Domestic Voice Process",
  "Team Leader - BPO",
  "Assistant Team Leader",
  "Quality Analyst",
  "Quality Auditor",
  "WFM Analyst",
  "Workforce Management Executive",
  "Backend Process Executive",
  "Data Processing Executive",
  "Data Entry Operator",
  "KPO Analyst",
  "Transaction Processing Executive",
  "Collections Associate",
  "Telecaller",
  "Telemarketing Executive",
];

const SALES_ROLES = [
  "Inside Sales Executive",
  "Inside Sales Representative",
  "Field Sales Executive",
  "Field Sales Officer",
  "Territory Sales Incharge",
  "Territory Sales Manager",
  "Area Sales Executive",
  "Key Account Manager",
  "Account Executive",
  "Business Development Manager",
  "Business Development Representative",
  "Tele Sales Executive",
  "Telesales Associate",
  "Channel Sales Manager",
  "Channel Sales Executive",
  "Institutional Sales Executive",
  "Corporate Sales Executive",
  "Real Estate Sales Executive",
  "Insurance Sales Executive",
  "Medical Representative",
  "Pharma Sales Executive",
  "Automobile Sales Consultant",
  "Pre-Sales Executive",
  "Post-Sales Coordinator",
];

const OPS_HR_ROLES = [
  "HR Executive",
  "HR Generalist",
  "HR Assistant",
  "Talent Acquisition Executive",
  "Recruiter",
  "IT Recruiter",
  "Campus Recruiter",
  "HRBP",
  "L&D Executive",
  "Admin Executive",
  "Admin Manager",
  "Office Coordinator",
  "Front Office Executive",
  "Receptionist",
  "Facility Executive",
  "Operations Manager",
  "Operations Associate",
  "Process Associate",
  "Process Trainer",
  "MIS Executive",
  "Reporting Analyst",
  "Compliance Executive",
  "Legal Executive",
  "Company Secretary",
  "Office Assistant",
];

const TECH_SKILLS = [
  "LangGraph",
  "LangChain",
  "Agent Design & Orchestration",
  "Tool Calling",
  "RAG Pipelines",
  "Semantic Memory",
  "Embeddings",
  "Vector Search",
  "Prompt Engineering",
  "Streaming LLMs",
  "OpenAI API",
  "FAISS",
  "Chroma",
  "Python",
  "JavaScript",
  "TypeScript",
  "Java",
  "C++",
  "PHP",
  "SQL",
  "FastAPI",
  "Node.js",
  "Express.js",
  "Django",
  "REST",
  "REST APIs",
  "GraphQL",
  "WebSockets",
  "tRPC",
  "React",
  "React.js",
  "Next.js",
  "Tailwind CSS",
  "Redux",
  "PostgreSQL",
  "MongoDB",
  "MySQL",
  "Redis",
  "Firebase",
  "Twilio",
  "Exotel",
  "SIP Trunking",
  "Real-Time Duplex Audio Streaming",
  "Multilingual TTS",
  "Microservices",
  "Event-Driven Systems",
  "AWS",
  "Azure",
  "Docker",
  "Git",
  "GitHub Actions",
  "CI/CD",
  "JWT",
  "OAuth 2.0",
  "RBAC",
  "Secure API Development",
  "Power BI",
  "Excel",
];

const FINANCE_SKILLS = [
  "Tally",
  "GST",
  "MS Excel",
  "Financial Reporting",
  "Accounts Payable",
  "Accounts Receivable",
  "SAP FICO",
  "Bank Reconciliation",
  "Taxation",
  "Budgeting",
  "QuickBooks",
  "Audit",
];

const COMMERCE_SKILLS = [
  "Inventory Management",
  "Stock Reconciliation",
  "Procurement",
  "Purchase Order",
  "Vendor Management",
  "Merchandising",
  "Visual Merchandising",
  "Category Management",
  "SAP",
  "SAP MM",
  "SAP SD",
  "MS Office",
  "MS Excel",
  "Negotiation",
  "Retail Operations",
  "POS",
  "Billing",
  "GST Billing",
  "Supply Chain",
  "Warehouse Management",
  "Logistics",
  "Dispatch",
  "Import Export",
  "EXIM Documentation",
  "E-commerce Operations",
  "Amazon Seller",
  "Flipkart Seller",
  "Catalog Management",
  "Order Fulfillment",
  "FMCG Distribution",
  "Channel Sales",
];

const BPO_SKILLS = [
  "Customer Service",
  "Communication",
  "CRM",
  "MS Excel",
  "Typing",
  "Call Handling",
  "Email Support",
  "Salesforce",
  "Zendesk",
  "Problem Solving",
  "Night Shift",
  "Process Adherence",
];

const SALES_SKILLS = [
  "Lead Generation",
  "CRM",
  "Negotiation",
  "Cold Calling",
  "Salesforce",
  "Presentation",
  "Relationship Management",
  "MS Excel",
];

const OPS_HR_SKILLS = [
  "Recruitment",
  "HRMS",
  "Payroll",
  "MS Excel",
  "Communication",
  "Vendor Coordination",
  "MIS Reporting",
  "Documentation",
];

const ROLES_BY_INDUSTRY: Record<string, string[]> = {
  Any: [
    ...TECH_ROLES,
    ...FINANCE_ROLES,
    ...COMMERCE_ROLES,
    ...BPO_ROLES,
    ...SALES_ROLES,
    ...OPS_HR_ROLES,
  ],
  Technology: TECH_ROLES,
  Finance: FINANCE_ROLES,
  "Commerce / Retail": COMMERCE_ROLES,
  "BPO / Customer Support": BPO_ROLES,
  Sales: SALES_ROLES,
  "Operations / HR": OPS_HR_ROLES,
};

const SKILLS_BY_INDUSTRY: Record<string, string[]> = {
  Any: [
    ...TECH_SKILLS,
    ...FINANCE_SKILLS,
    ...COMMERCE_SKILLS,
    ...BPO_SKILLS,
    ...SALES_SKILLS,
    ...OPS_HR_SKILLS,
  ],
  Technology: TECH_SKILLS,
  Finance: FINANCE_SKILLS,
  "Commerce / Retail": COMMERCE_SKILLS,
  "BPO / Customer Support": BPO_SKILLS,
  Sales: SALES_SKILLS,
  "Operations / HR": OPS_HR_SKILLS,
};

const HOT_ROLES_BY_INDUSTRY: Record<string, string[]> = {
  Any: [
    "Agentic AI Engineer",
    "Software Engineer",
    "Full Stack Engineer",
    "Accountant",
    "Accounts Executive",
    "Sales Executive",
    "Merchandiser",
    "Customer Support Associate",
    "Business Development Executive",
  ],
  Technology: [
    "Agentic AI Engineer",
    "AI Engineer",
    "LLM Engineer",
    "Software Engineer",
    "Software Developer",
    "Full Stack Engineer",
    "Full Stack Developer",
    "Backend Engineer",
    "Frontend Engineer",
  ],
  Finance: [
    "Accountant",
    "Accounts Executive",
    "Financial Analyst",
    "GST Executive",
    "Chartered Accountant",
    "Relationship Manager",
  ],
  "Commerce / Retail": [
    "Sales Executive",
    "Merchandiser",
    "Purchase Executive",
    "Store Manager",
    "E-commerce Executive",
    "Supply Chain Executive",
    "Inventory Executive",
    "FMCG Sales Officer",
  ],
  "BPO / Customer Support": [
    "Customer Support Associate",
    "Customer Care Executive",
    "Voice Process Executive",
    "Chat Support Executive",
    "Team Leader - BPO",
  ],
  Sales: [
    "Inside Sales Executive",
    "Field Sales Executive",
    "Business Development Executive",
    "Key Account Manager",
    "Medical Representative",
  ],
  "Operations / HR": [
    "HR Executive",
    "Recruiter",
    "Operations Executive",
    "MIS Executive",
    "Admin Executive",
  ],
};

const HOT_SKILLS_BY_INDUSTRY: Record<string, string[]> = {
  Any: ["Python", "LangGraph", "MS Excel", "SQL", "Customer Service"],
  Technology: [
    "LangGraph",
    "LangChain",
    "RAG Pipelines",
    "Prompt Engineering",
    "Python",
    "React",
    "SQL",
    "AWS",
  ],
  Finance: ["Tally", "GST", "MS Excel"],
  "Commerce / Retail": [
    "MS Excel",
    "Inventory Management",
    "Merchandising",
    "GST Billing",
    "SAP",
    "E-commerce Operations",
  ],
  "BPO / Customer Support": ["Customer Service", "Communication", "CRM"],
  Sales: ["Lead Generation", "CRM", "Negotiation"],
  "Operations / HR": ["MS Excel", "Recruitment", "Communication"],
};

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

export function rolesForIndustry(industry: string): string[] {
  return unique(ROLES_BY_INDUSTRY[industry] ?? ROLES_BY_INDUSTRY.Any);
}

export function skillsForIndustry(industry: string): string[] {
  return unique(SKILLS_BY_INDUSTRY[industry] ?? SKILLS_BY_INDUSTRY.Any);
}

export function hotRolesForIndustry(industry: string): string[] {
  return HOT_ROLES_BY_INDUSTRY[industry] ?? HOT_ROLES_BY_INDUSTRY.Any;
}

export function hotSkillsForIndustry(industry: string): string[] {
  return HOT_SKILLS_BY_INDUSTRY[industry] ?? HOT_SKILLS_BY_INDUSTRY.Any;
}

export function rolesForIndustries(industries: string[]): string[] {
  const selected = industries.length ? industries : ["Any"];
  if (selected.includes("Any")) {
    return rolesForIndustry("Any");
  }
  return unique(selected.flatMap((item) => rolesForIndustry(item)));
}

export function skillsForIndustries(industries: string[]): string[] {
  const selected = industries.length ? industries : ["Any"];
  if (selected.includes("Any")) {
    return skillsForIndustry("Any");
  }
  return unique(selected.flatMap((item) => skillsForIndustry(item)));
}

export function hotRolesForIndustries(industries: string[]): string[] {
  const selected = industries.length ? industries : ["Any"];
  if (selected.includes("Any")) {
    return hotRolesForIndustry("Any");
  }
  return unique(selected.flatMap((item) => hotRolesForIndustry(item)));
}

export function hotSkillsForIndustries(industries: string[]): string[] {
  const selected = industries.length ? industries : ["Any"];
  if (selected.includes("Any")) {
    return hotSkillsForIndustry("Any");
  }
  return unique(selected.flatMap((item) => hotSkillsForIndustry(item)));
}

/** Combined lists — used when industry is Any or unset. */
export const ROLE_SUGGESTIONS = rolesForIndustry("Any");
export const SKILL_SUGGESTIONS = skillsForIndustry("Any");
export const HOT_ROLE_TITLES = hotRolesForIndustry("Any");
export const HOT_SKILLS = hotSkillsForIndustry("Any");
