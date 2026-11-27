// Edition được chọn khi bấm nút nhanh của nhóm mở rộng (chỉ dùng trong bản demo).
export const DEMO_PRESETS = {
  cloudidentity: ['Cloud Identity Free', 'Cloud Identity Premium'],
  aiexpanded: ['AI: Business Starter', 'AI: Business Standard/Plus Enterprise Standard/Plus', 'AI Expanded Access']
};

// DỮ LIỆU GIẢ để xem trước giao diện Cloud Identity và AI Expanded Access.
// Chỉ dùng khi mở trang với ?demo=extras. Không phải dữ liệu thật từ Google.
export function demoExtras() {
  // Nhãn (label) là tên cột như trang Google. Tên nội bộ (name) tránh trùng với edition Workspace.
  const editions = [
    { name: 'Cloud Identity Free', family: 'cloudidentity' },
    { name: 'Cloud Identity Premium', family: 'cloudidentity' },
    { name: 'AI: Business Starter', label: 'Business Starter', family: 'aiexpanded' },
    { name: 'AI: Business Standard/Plus Enterprise Standard/Plus', label: 'Business Standard/Plus Enterprise Standard/Plus', family: 'aiexpanded' },
    { name: 'AI Expanded Access', family: 'aiexpanded' }
  ];
  const sections = [
    {
      title: 'Cloud Identity (demo)',
      family: 'cloudidentity',
      notes: {},
      items: [
        { id: 'demo-ci-1', feature: '2-Step Verification (demo)', links: [], subitems: [],
          values: {
            'Cloud Identity Free': { v: 'Có', n: [] },
            'Cloud Identity Premium': { v: 'Có', n: [] }
          } },
        { id: 'demo-ci-2', feature: 'Storage per user (demo)', links: [], subitems: [],
          values: {
            'Cloud Identity Free': { v: 'Không', n: [] },
            'Cloud Identity Premium': { v: '15 GB (demo)', n: [] }
          } }
      ]
    },
    {
      title: 'AI Expanded Access (demo)',
      family: 'aiexpanded',
      notes: {},
      items: [
        { id: 'demo-ae-1', feature: 'Match writing style (demo)', links: [], subitems: [],
          values: {
            'AI: Business Starter': { v: 'No access', n: [] },
            'AI: Business Standard/Plus Enterprise Standard/Plus': { v: '30 per month', n: [] },
            'AI Expanded Access': { v: '150 per month', n: [] }
          } }
      ]
    }
  ];
  return { editions, sections };
}
