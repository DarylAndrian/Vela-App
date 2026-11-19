/** Typed wrappers over the IPC surface exposed by src/preload/preload.js. */
export interface VelaIdentity {
  sub: string;
  username: string;
  role: string;
  permissions: Record<string, string>;
  token_id: string | null;
}

export interface VelaStatus {
  connected: boolean;
  identity: VelaIdentity | null;
  daysRemaining: number | null;
  baseUrl: string;
  error?: string;
}

export interface ChartCode {
  id: number;
  title: string;
  mmd_code: string;
  product_name?: string | null;
  product_id?: string | null;
  protected: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  color?: string | null;
}

export type ChartChanges = Partial<Pick<ChartCode, 'title' | 'mmd_code' | 'product_id' | 'product_name'>>;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; authExpired?: boolean; status?: number };

interface VelaBridge {
  status(): Promise<VelaStatus>;
  connect(token: string): Promise<VelaStatus>;
  disconnect(): Promise<void>;
  openSite(): Promise<void>;
  charts: {
    list(): Promise<Result<ChartCode[]>>;
    get(id: number): Promise<Result<ChartCode>>;
    create(title: string, mmd_code?: string): Promise<Result<ChartCode>>;
    update(id: number, changes: ChartChanges): Promise<Result<ChartCode>>;
    delete(id: number): Promise<Result<void>>;
  };
  products: {
    list(): Promise<Result<Product[]>>;
  };
  files: {
    save(defaultName: string, filters: { name: string; extensions: string[] }[], dataBase64: string): Promise<string | null>;
    reveal(target: string): Promise<{ ok: boolean }>;
    openImages(): Promise<{ name: string; dataBase64: string }[]>;
  };
  clipboard: {
    writeImage(pngBase64: string): Promise<void>;
    writeText(text: string): Promise<void>;
  };
  onAuthExpired(cb: () => void): void;
}

export const vela = (): VelaBridge => (window as any).vela;
