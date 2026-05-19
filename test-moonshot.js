const apiKey = 'sk-ufnDYYltZCDlwAinTe6Le9X9MX6Ze5jq4hdBDc0JH6A29YF3';

async function test() {
  // First request to get tool call
  const res1 = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: '茅台股票怎么样' }
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'eastmoney_stock_quote',
          description: 'Get stock quote',
          parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] }
        }
      }]
    })
  });
  const data1 = await res1.json();
  console.log('First response tool_calls:', JSON.stringify(data1.choices[0].message.tool_calls, null, 2));

  const tc = data1.choices[0].message.tool_calls[0];

  // Second request with tool result - need assistant message with tool_calls
  const res2 = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: '茅台股票怎么样' },
        { role: 'assistant', content: '', tool_calls: [tc] },
        { role: 'tool', content: '{"price": 1324}', tool_call_id: tc.id }
      ]
    })
  });
  const data2 = await res2.json();
  if (data2.error) {
    console.log('Error:', JSON.stringify(data2.error, null, 2));
  } else {
    console.log('Second response:', data2.choices[0].message.content.substring(0, 100));
  }
}

test().catch(console.error);
