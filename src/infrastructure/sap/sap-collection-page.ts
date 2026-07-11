export interface SapFilterOption {
  key: string;
  label: string;
}

export interface SapCollectionPage {
  selectTab(index: number): Promise<void>;
  listFilterOptions(filterIndex: number): Promise<SapFilterOption[]>;
  selectFilterOption(filterIndex: number, key: string): Promise<void>;
  search(): Promise<void>;
  readRows(): Promise<string[][]>;
}
