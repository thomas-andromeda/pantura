'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Card from '@mui/material/Card'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'
import CardContent from '@mui/material/CardContent'
import OptionsMenu from '@core/components/option-menu'
import { supabase } from '@/libs/supabaseClient'
import { useDevice } from '@/contexts/DeviceContext'

const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

const TemperatureOverview = () => {
  const theme = useTheme()
  const { activeDevice } = useDevice()
  const [series, setSeries] = useState([
    { name: 'Suhu', data: [] },
    { name: 'Kelembapan', data: [] }
  ])
  const [categories, setCategories] = useState([])

  const divider = 'var(--mui-palette-divider)'
  const disabled = 'var(--mui-palette-text-disabled)'
  const primary = 'var(--mui-palette-primary-main)'
  const info = 'var(--mui-palette-info-main)'

  const fetchChartData = useCallback(async () => {
    if (!activeDevice?.device_token) {
      setSeries([
        { name: 'Suhu', data: [] },
        { name: 'Kelembapan', data: [] }
      ])
      setCategories([])
      return
    }

    try {
      const { data, error } = await supabase
        .from('sensor_data')
        .select('suhu, kelembapan, created_at')
        .eq('device_token', activeDevice.device_token)
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
  }, [activeDevice?.device_token])

  useEffect(() => {
    fetchChartData()

    if (!activeDevice?.device_token) return

    const channel = supabase
      .channel(`temp_realtime_${activeDevice.device_token}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sensor_data',
          filter: `device_token=eq.${activeDevice.device_token}`
        },
        () => fetchChartData()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeDevice?.device_token, fetchChartData])

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

  // ─── Color tokens (PANTURA Design System) ──────────────────────────────────
  const isDark        = theme.palette.mode === 'dark'
  const accent        = isDark ? '#A78BFA' : '#7C3AED'
  const borderColor   = isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.12)'
  const textSecondary = isDark ? '#9390B0' : '#6B6A85'

  if (!activeDevice) {
    return (
      <Card sx={{
        borderRadius: '16px',
        border: `0.5px solid ${borderColor}`,
        boxShadow: 'none',
      }}>
        <CardHeader title='Ikhtisar Suhu & Kelembapan' />
        <CardContent className='flex items-center justify-center min-bs-[200px]'>
          <Typography color='textSecondary'>Pilih perangkat terlebih dahulu</Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card sx={{
      borderRadius: '16px',
      border: `0.5px solid ${borderColor}`,
      boxShadow: 'none',
    }}>
      <CardHeader
        title={`Ikhtisar - ${activeDevice.device_name}`}
        titleTypographyProps={{ sx: { fontSize: '16px', fontWeight: 600, color: 'text.primary' } }}
        action={
          <OptionsMenu 
            iconClassName='text-textPrimary' 
            options={[{ text: 'Refresh', menuItemProps: { onClick: () => fetchChartData() } }]} 
          />
        }
      />
      <CardContent sx={{ '& .apexcharts-canvas': { margin: '0 auto' } }}>
        <AppReactApexCharts type='line' height={320} width='100%' series={series} options={options} />
        
        {/* ── Nilai Suhu & Kelembapan Saat Ini ── */}
        <Box sx={{ display: 'flex', gap: 4, mt: 3, pt: 3, borderTop: `1px solid ${borderColor}` }}>
          {/* Suhu */}
          <Box>
            <Typography sx={{
              fontSize: '28px', fontWeight: 600, fontFamily: 'monospace',
              color: accent, lineHeight: 1.2
            }}>
              {series[0].data.length > 0 ? `${series[0].data[series[0].data.length - 1]}°C` : '--'}
            </Typography>
            <Typography sx={{ fontSize: '12px', color: textSecondary, mt: 0.3 }}>Suhu Saat Ini</Typography>
          </Box>

          {/* Separator vertikal */}
          <Box sx={{ width: '1px', bgcolor: borderColor, alignSelf: 'stretch' }} />

          {/* Kelembapan */}
          <Box>
            <Typography sx={{
              fontSize: '28px', fontWeight: 600, fontFamily: 'monospace',
              color: theme.palette.info.main, lineHeight: 1.2
            }}>
              {series[1].data.length > 0 ? `${series[1].data[series[1].data.length - 1]}%` : '--'}
            </Typography>
            <Typography sx={{ fontSize: '12px', color: textSecondary, mt: 0.3 }}>Kelembapan Saat Ini</Typography>
          </Box>
        </Box>

      </CardContent>
    </Card>
  )
}

export default TemperatureOverview