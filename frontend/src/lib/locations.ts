export const COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "Canada",
  "Germany",
  "Singapore",
  "United Arab Emirates",
  "Australia",
  "Netherlands",
] as const;

export const STATES_BY_COUNTRY: Record<string, string[]> = {
  India: [
    "Andhra Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Delhi",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jammu and Kashmir",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Tamil Nadu",
    "Telangana",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
  ],
  "United States": [
    "California",
    "New York",
    "Texas",
    "Washington",
    "Massachusetts",
    "Illinois",
    "Colorado",
    "Georgia",
    "Florida",
    "Pennsylvania",
  ],
  "United Kingdom": ["England", "Scotland", "Wales", "Northern Ireland"],
  Canada: ["Ontario", "British Columbia", "Quebec", "Alberta"],
  Germany: ["Berlin", "Bavaria", "Hamburg", "Hesse", "North Rhine-Westphalia"],
  Singapore: ["Singapore"],
  "United Arab Emirates": ["Dubai", "Abu Dhabi", "Sharjah"],
  Australia: ["New South Wales", "Victoria", "Queensland", "Western Australia"],
  Netherlands: ["North Holland", "South Holland", "Utrecht"],
};

export const CITY_TO_STATE: Record<string, { state: string; country: string }> = {
  bangalore: { state: "Karnataka", country: "India" },
  bengaluru: { state: "Karnataka", country: "India" },
  mysore: { state: "Karnataka", country: "India" },
  mumbai: { state: "Maharashtra", country: "India" },
  pune: { state: "Maharashtra", country: "India" },
  hyderabad: { state: "Telangana", country: "India" },
  chennai: { state: "Tamil Nadu", country: "India" },
  delhi: { state: "Delhi", country: "India" },
  noida: { state: "Uttar Pradesh", country: "India" },
  gurgaon: { state: "Haryana", country: "India" },
  gurugram: { state: "Haryana", country: "India" },
  kolkata: { state: "West Bengal", country: "India" },
  ahmedabad: { state: "Gujarat", country: "India" },
  jaipur: { state: "Rajasthan", country: "India" },
  kochi: { state: "Kerala", country: "India" },
};

export function parseStoredLocations(locations: string[] | null | undefined): {
  country: string;
  states: string[];
  remote: boolean;
} {
  const items = locations ?? [];
  const remote = items.some((item) => item.toLowerCase() === "remote");
  let country = "India";
  const states: string[] = [];

  for (const raw of items) {
    if (raw.toLowerCase() === "remote") continue;
    const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (parts.length >= 2 && COUNTRIES.includes(last as (typeof COUNTRIES)[number])) {
      country = last;
      const region = parts[0];
      if (region && region.toLowerCase() !== country.toLowerCase()) {
        states.push(region);
      }
      continue;
    }
    if (COUNTRIES.includes(raw as (typeof COUNTRIES)[number])) {
      country = raw;
      continue;
    }
    const city = CITY_TO_STATE[raw.toLowerCase()];
    if (city) {
      country = city.country;
      states.push(city.state);
      continue;
    }
    states.push(raw);
  }

  return { country, states: Array.from(new Set(states)), remote };
}

export function toStoredLocations(
  country: string,
  states: string[],
  remote: boolean,
): string[] {
  const uniqueStates = Array.from(new Set(states.map((s) => s.trim()).filter(Boolean)));
  const geo = uniqueStates.length
    ? uniqueStates.map((state) => `${state}, ${country}`)
    : country
      ? [country]
      : [];
  return remote ? [...geo, "Remote"] : geo;
}
