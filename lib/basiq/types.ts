// Minimal Basiq v3 response types — only the fields we actually consume.
// The full schema is much larger; see https://api.basiq.io/reference.

export interface BasiqTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  token_type: "Bearer";
}

export interface BasiqUser {
  id: string;
  type: "user";
  email?: string;
  mobile?: string;
}

export interface BasiqAuthLink {
  type: "auth_link";
  public: boolean;
  expiresAt: string;
  links: {
    public: string; // The URL to redirect the user to.
  };
}

export interface BasiqConnection {
  id: string;
  type: "connection";
  status: "active" | "pending" | "invalid" | "expired" | string;
  institution: { id: string; links?: { self?: string } };
  accounts?: { data?: BasiqAccount[] };
}

export interface BasiqInstitution {
  id: string;
  type: "institution";
  name: string;
  shortName?: string;
}

export interface BasiqAccount {
  id: string;
  type: "account";
  accountNo?: string;
  name?: string;
  currency?: string;
  balance?: string;
  class?: { type?: string; product?: string };
}

export interface BasiqTransaction {
  id: string;
  type: "transaction";
  status: "posted" | "pending";
  description: string;
  amount: string; // string-typed decimal, e.g. "-12.50"
  account: string; // account id
  balance?: string;
  direction: "debit" | "credit";
  class?: string;
  institution?: string;
  connection?: string;
  transactionDate?: string; // YYYY-MM-DD
  postDate?: string; // YYYY-MM-DD
  subClass?: { title?: string; code?: string };
  enrich?: {
    merchant?: { businessName?: string };
    category?: { anzsic?: { class?: { title?: string } } };
  };
}

export interface BasiqList<T> {
  type: "list";
  count: number;
  size: number;
  data: T[];
  links?: { self?: string; next?: string };
}
