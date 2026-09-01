export type AppConfig = {
  defaultLanguage: string;
  direction: 'rtl' | 'ltr';
  theme: 'light' | 'dark' | 'system';
};

export type ServiceModule = {
  id: string;
  name: string;
  icon: string;
  path: string;
  active: boolean;
  color: string;
};

export const appConfig: AppConfig = {
  defaultLanguage: 'fa',
  direction: 'rtl',
  theme: 'light',
};

export const appModules: ServiceModule[] = [
  { id: 'taxi', name: 'تاکسی اینترنتی', icon: 'Car', path: '/taxi', active: true, color: 'bg-yellow-500' },
  { id: 'cargo', name: 'پیک و باربری', icon: 'Truck', path: '/cargo', active: true, color: 'bg-blue-600' },
  { id: 'bazaar', name: 'بازارچه', icon: 'ShoppingBag', path: '/bazaar', active: false, color: 'bg-green-500' },
  { id: 'tourism', name: 'گردشگری', icon: 'Map', path: '/tourism', active: false, color: 'bg-teal-500' },
  { id: 'wallet', name: 'کیف پول', icon: 'Wallet', path: '/wallet', active: true, color: 'bg-purple-500' }
];