import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

const ZoomSlider = ({ data, settings, onZoom, height = 24 }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !data) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const { theme } = settings;
    const time_ms = data.time_ms || [];
    const minX = time_ms.length > 0 ? time_ms[0] : 0;
    const maxX = time_ms.length > 0 ? time_ms[time_ms.length - 1] : 100;

    const option = {
      backgroundColor: 'transparent',
      grid: {
        top: 0,
        bottom: 0,
        left: 10,
        right: 20,
      },
      xAxis: {
        type: 'value',
        min: minX,
        max: maxX,
        show: false,
      },
      yAxis: {
        show: false,
      },
      dataZoom: [
        {
          type: 'slider',
          height: height - 4,
          top: 2,
          handleSize: '80%',
          handleStyle: { color: '#4488ff', opacity: 0.8 },
          moveHandleStyle: { color: '#4488ff', opacity: 0.2 },
          fillerColor: 'rgba(0,150,255,0.06)',
          borderColor: 'transparent',
          backgroundColor: 'transparent',
          showDataShadow: false,
          textStyle: { color: theme.textColor, fontSize: 9 },
          labelFormatter: (v) => `${Number(v).toFixed(0)}ms`,
        }
      ],
      series: [
        {
          type: 'line',
          data: time_ms.map(t => [t, 0]),
          symbol: 'none',
          lineStyle: { opacity: 0 }
        }
      ]
    };

    chartInstance.current.setOption(option);

    const handleZoom = (params) => {
      // Triggered by manual slider move
      if (params.batch) {
        onZoom(params.batch[0]);
      } else {
        onZoom(params);
      }
    };

    chartInstance.current.on('dataZoom', handleZoom);

    const ro = new ResizeObserver(() => chartInstance.current?.resize());
    ro.observe(chartRef.current);

    return () => {
      chartInstance.current?.off('dataZoom', handleZoom);
      ro.disconnect();
    };
  }, [data, settings, height, onZoom]);

  return <div ref={chartRef} style={{ width: '100%', height: `${height}px` }} />;
};

export default ZoomSlider;
