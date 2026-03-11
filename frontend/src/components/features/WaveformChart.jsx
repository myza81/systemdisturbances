import React, { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';

function WaveformChart({ recordId }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    async function fetchData() {
      const chRes = await axios.get(`/api/v1/disturbances/${recordId}/channels/`);
      if (!chRes.data.length) return;
      const chId = chRes.data[0].id;
      const dataRes = await axios.get(
        `/api/v1/disturbances/${recordId}/channels/${chId}/data/?downsample=2000`
      );
      setData(dataRes.data.samples.map(s => [s.time_us, s.value]));
    }
    fetchData();
  }, [recordId]);

  const option = {
    xAxis: { type: 'value', name: 'time_us' },
    yAxis: { type: 'value', name: 'value' },
    series: [{ data, type: 'line', showSymbol: false }],
  };

  return <ReactECharts option={option} style={{ height: 300 }} />;
}

export default WaveformChart;
