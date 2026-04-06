
self.onmessage = async (e: MessageEvent) => {
  const xlsx = await import('xlsx');
  const { data, fileName, sheetName } = e.data;
  
  try {
    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
    
    // Generate binary string
    const wbout = xlsx.write(wb, { bookType: 'xlsx', type: 'array' });
    
    self.postMessage({ success: true, data: wbout, fileName });
  } catch (error: any) {
    self.postMessage({ success: false, error: error.message });
  }
};
