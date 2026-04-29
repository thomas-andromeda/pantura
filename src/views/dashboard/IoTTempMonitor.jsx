'use client'

import { useEffect, useState } from 'react'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import OptionMenu from '@core/components/option-menu'
import CustomAvatar from '@core/components/mui/Avatar'
import { supabase } from '@/libs/supabaseClient'

const IoTTempMonitor = () => {
  const [statsData, setStatsData] = useState([
    { stats: '...', title: 'Avg Temp', color: 'primary', icon: 'ri-temp-hot-line' },
    { stats: '...', title: 'Humidity', color: 'info', icon: 'ri-drop-line' },
    { stats: '...', title: 'Total Logs', color: 'warning', icon: 'ri-database-2-line' },
    { stats: 'Checking...', title: 'Status', color: 'success', icon: 'ri-router-line' }
  ])

  const checkDeviceStatus = (lastDataTime) => {
    if (!lastDataTime) return 'Offline'
    const lastUpdate = new Date(lastDataTime)
    const now = new Date()
    const diffInSeconds = (now - lastUpdate) / 1000
    return diffInSeconds > 10 ? 'Offline' : 'Online'
  }

  const fetchLatestData = async () => {
    try {
      const { data, error, count } = await supabase
        .from('sensor_data')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error

      if (data && data.length > 0) {
        const avgTemp = data.reduce((acc, curr) => acc + curr.suhu, 0) / data.length
        const avgHum = data.reduce((acc, curr) => acc + curr.kelembapan, 0) / data.length
        const latest = data[0]
        const deviceStatus = checkDeviceStatus(latest.created_at)
        
        setStatsData([
          {
            stats: `${avgTemp.toFixed(1)}°C`,
            title: 'Rata-rata Suhu',
            color: 'primary',
            icon: 'ri-temp-hot-line'
          },
          {
            stats: `${avgHum.toFixed(1)}%`,
            title: 'Rata-rata Kelembapan',
            color: 'info',
            icon: 'ri-drop-line'
          },
          {
            stats: count?.toLocaleString() || '0',
            title: 'Total Data',
            color: 'warning',
            icon: 'ri-database-2-line'
          },
          {
            stats: deviceStatus,
            title: 'Status',
            color: deviceStatus === 'Online' ? 'success' : 'error',
            icon: 'ri-router-line'
          }
        ])
      }
    } catch (err) {
      console.error(err.message)
    }
  }

  useEffect(() => {
    fetchLatestData()
    const channel = supabase
      .channel('realtime_iot_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_data' },
        () => fetchLatestData()
      )
      .subscribe()

    const interval = setInterval(() => {
      fetchLatestData()
    }, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  return (
    <Card className='bs-full'>
      <CardHeader
        title='IoT Temperature + Humidity Monitor'
        action={
          <OptionMenu 
            iconClassName='text-textPrimary' 
            options={[
              { text: 'Refresh', menuItemProps: { onClick: () => fetchLatestData() } }
            ]} 
          />
        }
        subheader={
          <div className='mbs-1'>
            <span className='font-medium text-textPrimary'>Smart Monitoring System </span>
            <span className='text-textSecondary ml-1'>- Kamar </span>
          </div>
        }
      />
      <CardContent className='!pbs-5'>
        <Grid container spacing={4}>
          {statsData.map((item, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <div className='flex items-center gap-4'>
                <CustomAvatar variant='rounded' color={item.color} skin='light' className='shrink-0 shadow-xs'>
                  <i className={item.icon}></i>
                </CustomAvatar>
                <div className='flex flex-col min-w-0'>
                  <Typography variant='caption' className='text-textSecondary' noWrap>
                    {item.title}
                  </Typography>
                  <Typography variant='h6' className='font-semibold'>
                    {item.stats}
                  </Typography>
                </div>
              </div>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  )
}

export default IoTTempMonitor