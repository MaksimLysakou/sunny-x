// Real Fively client reviews curated from the Clutch profile
// (https://clutch.co/profile/fively#reviews). Clutch is behind a Cloudflare
// challenge and renders reviews with JS, so a runtime fetch is not possible —
// these are extracted once and injected into the article writer when the brief
// asks for reviews/testimonials. Re-extract periodically to refresh.
//
// All reviews are 5.0★. Quotes are verbatim; some company names are anonymized
// exactly as Clutch displays them.

export const CLUTCH_REVIEWS_URL = "https://clutch.co/profile/fively#reviews";

export type ClutchReview = {
  quote: string;
  role: string;
  company: string;
  context: string;
};

export const CLUTCH_REVIEWS: ClutchReview[] = [
  {
    quote: "We are very satisfied with the result of our cooperation so far.",
    role: "CEO",
    company: "AI Analytics Company",
    context: "AI behavioral prediction platform with React.js and Python",
  },
  {
    quote:
      "The most impressive thing about them is how they handle complex refactoring without disrupting the overall system.",
    role: "CTO",
    company: "DextraData GmbH",
    context: "Refactoring a monolithic architecture to microservices",
  },
  {
    quote: "The speed and quality were outstanding.",
    role: "Founder & CEO",
    company: "The Population Project",
    context: "Chrome extension and SaaS web app with React and NestJS",
  },
  {
    quote:
      "Their engineers demonstrate deep technical expertise and commitment to delivering a properly functioning web portal.",
    role: "Business Process Manager",
    company: "Happen Ventures",
    context: "Web portal revamp from no-code to a software stack",
  },
  {
    quote: "Everything they provided was top-notch.",
    role: "CEO",
    company: "Gunsnation.com",
    context: "E-commerce marketplace with Strapi and Next.js",
  },
  {
    quote: "I look forward to working with them again in the future!",
    role: "Chief of Product",
    company: "Coinjoy",
    context: "Bug fixes, performance optimization, and features for a crypto platform",
  },
  {
    quote:
      "They make the most of resources, demonstrating their experience and commitment to delivering effective solutions.",
    role: "VP Product Development",
    company: "eqhq",
    context: "Platform revamp and functionality enhancements with AWS and React",
  },
  {
    quote:
      "We collaborate with top-notch web developers who tackle challenges fearlessly.",
    role: "CTO",
    company: "Legal Tech Solutions Company",
    context: "Web-based legal tech solution with Python and FastAPI",
  },
  {
    quote:
      "Their punctuality and dedication to delivering on time were truly impressive.",
    role: "CEO",
    company: "Primeseo",
    context: "Corporate website with WordPress CMS",
  },
  {
    quote:
      "They are experts in their field, and we rely heavily on their technical knowledge.",
    role: "CEO",
    company: "IT Consultancy",
    context: "Platform design and development with React and Node.js",
  },
  {
    quote:
      "While there may have been some minor hiccups along the way, our overall experience with Fively has been very positive.",
    role: "CEO",
    company: "DogQ",
    context: "MVP for a no-code test automation platform",
  },
  {
    quote: "We see them as reliable and professional partners.",
    role: "Senior Product Manager",
    company: "CYCLE",
    context: "Web and mobile app with QA and UI/UX design",
  },
  {
    quote:
      "We've been working with really experienced folks who can see the big picture, and it makes a difference.",
    role: "CEO & Co-Founder",
    company: "Sellix SRL",
    context: "E-commerce product refactoring with new features and integrations",
  },
  {
    quote:
      "What impressed me the most are their work ethic and flexibility to adapt their services to our needs.",
    role: "Founder & CTO",
    company: "bloXmove.com",
    context: "Frontend and backend for a blockchain-based mobility platform",
  },
  {
    quote: "We made the right decision by scaling up our team with their resources.",
    role: "CTO",
    company: "Custom Retail Technology Company",
    context: "Front-end and backend with Ruby, JavaScript, and Node.js",
  },
  {
    quote: "They know what they're doing and are just good engineers, overall.",
    role: "Co-Founder & CEO",
    company: "SaaS Startup",
    context: "MVP for compensation software with React and Node.js",
  },
  {
    quote: "I was most impressed with their communication.",
    role: "CEO",
    company: "MessageBuy",
    context: "Server infrastructure rework and maintenance on Shopify",
  },
  {
    quote:
      "We see them as partners who help us meet our goals rather than just contractors.",
    role: "VP of Engineering",
    company: "Avi Medical GmbH",
    context: "Mobile app implementation and launch with React Native",
  },
  {
    quote:
      "Diligent project managers and the team will go the extra mile when you need them to.",
    role: "CEO",
    company: "SaaS Company",
    context: "Chrome extension, desktop app, and SaaS application development",
  },
  {
    quote: "They did a wonderful job!",
    role: "Founder",
    company: "ComFi",
    context: "React frontend for a fintech web platform",
  },
  {
    quote: "These are people who are really good at what they do.",
    role: "CTO",
    company: "Data Science Services Provider",
    context: "GUI development and database optimization for a natural-language interface",
  },
];
