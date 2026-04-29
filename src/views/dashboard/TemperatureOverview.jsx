'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Card from '@mui/material/Card'
import Button from '@mui/material/Button'
import { useTheme } from '@mui/material/styles'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'
import CardContent from '@mui/material/CardContent'
import OptionsMenu from '@core/components/option-menu'
import { supabase } from '@/libs/supabaseClient'

const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

const TemperatureOverview = () => {
  const theme = useTheme()
  const [series, setSeries] = useState([
    { name: 'Suhu', data: [] },
    { name: 'Kelembapan', data: [] }
  ])
  const [categories, setCategories] = useState([])

  const divider = 'var(--mui-palette-divider)'
  const disabled = 'var(--mui-palette-text-disabled)'
  const primary = 'var(--mui-palette-primary-main)'
  const info = 'var(--mui-palette-info-main)'

  const fetchChartData = async () => {
    try {
      const { data, error } = await supabase
        .from('sensor_data')
        .select('suhu, kelembapan, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error

      if (data) {
        const reversedData = [...data].reverse()
        setSeries([
          { name: 'Suhu', data: reversedData.map(item => item.suhu) },
          { name: 'Kelembapan', data: reversedData.map(item => item.kelembapan) }
        ])
        setCategories(reversedData.map(item => {
          const date = new Date(item.created_at)
          return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        }))
      }
    } catch (err) {
      console.error(err.message)
    }
  }

  useEffect(() => {
    fetchChartData()
    const channel = supabase
      .channel('temp_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_data' }, () => fetchChartData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const options = {
    chart: {
      parentHeightOffset: 0,
      toolbar: { 
        show: true,
        offsetX: 0,
        offsetY: -5,
        tools: {
          download: false,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true
        }
      }
    },
    markers: { 
      size: 5,
      strokeWidth: 0,
      hover: { size: 7 }
    },
    stroke: { 
      curve: 'smooth', 
      width: 3
    },
    grid: {
      borderColor: divider,
      strokeDashArray: 7,
      padding: { left: 25, right: 25, top: 20, bottom: 5 }
    },
    colors: [primary, info],
    xaxis: {
      categories: categories,
      labels: { style: { colors: disabled } },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: [
      {
        title: { text: 'Suhu (°C)', style: { color: primary, fontWeight: 500 } },
        labels: { style: { colors: disabled }, formatter: val => `${val}°C` }
      },
      {
        opposite: true,
        title: { text: 'Kelembapan (%)', style: { color: info, fontWeight: 500 } },
        labels: { style: { colors: disabled }, formatter: val => `${val}%` }
      }
    ],
    annotations: {
      yaxis: [
        {
          y: 26,
          y2: 30,
          fillColor: '#00E396',
          opacity: 0.1,
          borderColor: 'transparent',
          label: {
            text: 'Suhu Nyaman',
            position: 'left',
            textAnchor: 'start',
            borderWidth: 0,
            style: { color: '#00E396', background: 'transparent' }
          }
        },
        {
          y: 40,
          y2: 65,
          yAxisIndex: 1,
          fillColor: info,
          opacity: 0.05,
          borderColor: 'transparent',
          label: {
            text: 'Lembab Nyaman',
            position: 'right',
            textAnchor: 'end',
            borderWidth: 0,
            style: { color: info, background: 'transparent' }
          }
        }
      ]
    },
    legend: { 
      show: true,
      position: 'top', 
      horizontalAlign: 'left', 
      labels: { colors: disabled },
      offsetY: 7,
      itemMargin: { horizontal: 10 }
    }
  }

  return (
    <Card>
      <CardHeader
        title='TemperatureOverview'
        action={
          <OptionsMenu 
            iconClassName='text-textPrimary' 
            options={[{ text: 'Refresh', menuItemProps: { onClick: () => fetchChartData() } }]} 
          />
        }
      />
      <CardContent sx={{ '& .apexcharts-canvas': { margin: '0 auto' } }}>
        <AppReactApexCharts type='line' height={320} width='100%' series={series} options={options} />
        
        <div className='flex items-center mbs-4 gap-8'>
          <div className='flex flex-col'>
            <Typography variant='h4' color='primary'>
              {series[0].data.length > 0 ? `${series[0].data[series[0].data.length - 1]}°C` : '--'}
            </Typography>
            <Typography variant='caption'>Suhu Saat Ini</Typography>
          </div>

          <div className='h-10 w-px bg-divider'></div>

          <div className='flex flex-col'>
            <Typography variant='h4' color='info.main'>
              {series[1].data.length > 0 ? `${series[1].data[series[1].data.length - 1]}%` : '--'}
            </Typography>
            <Typography variant='caption'>Kelembapan Saat Ini</Typography>
          </div>
        </div>

      </CardContent>
    </Card>
  )
}

export default TemperatureOverview