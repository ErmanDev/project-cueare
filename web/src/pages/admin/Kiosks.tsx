import { useCallback, useEffect, useState } from 'react'
import { Activity, HardDrive, MapPin, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { api } from '../../lib/api'

interface KioskDevice {
  deviceId: number
  deviceCode: string
  deviceName: string
  location: string | null
  isActive: boolean
  status: 'ONLINE' | 'OFFLINE'
  lastHeartbeatAtUtc: string | null
  ipAddress: string | null
}

export function AdminKiosks() {
  const [kiosks, setKiosks] = useState<KioskDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchKiosks = useCallback(async () => {
    try {
      const data = await api.get<KioskDevice[]>('/v1/admin/kiosks')
      if (Array.isArray(data)) {
        setKiosks(data)
      }
    } catch {
      /* ignore fetch error */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void fetchKiosks()
    // Poll every 5 seconds for live Native WS heartbeat presence updates
    const interval = setInterval(() => {
      void fetchKiosks()
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchKiosks])

  const onlineCount = kiosks.filter((k) => k.status === 'ONLINE').length
  const offlineCount = kiosks.filter((k) => k.status === 'OFFLINE').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <HardDrive className="w-7 h-7 text-indigo-600" />
            Attendance Kiosks & Hardware Presence
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time Native WebSockets (5s ping/pong) hardware monitor
          </p>
        </div>
        <button
          onClick={() => {
            setRefreshing(true)
            void fetchKiosks()
          }}
          disabled={refreshing}
          className="btn btn-secondary text-xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Hardware Status</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">Total Kiosks Registered</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{kiosks.length}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <HardDrive className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500 flex items-center gap-1 text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Online Devices
            </div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{onlineCount}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Wifi className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500 text-rose-600">Offline / Disconnected</div>
            <div className="text-2xl font-bold text-rose-600 mt-1">{offlineCount}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <WifiOff className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Hardware List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-500" />
            Active Devices Roster
          </h2>
          <span className="text-xs text-slate-400">Live Auto-Update (Every 5s)</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading kiosk devices...</div>
        ) : kiosks.length === 0 ? (
          <div className="p-12 text-center">
            <HardDrive className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium text-sm">No Kiosk Hardware Devices Connected</p>
            <p className="text-slate-400 text-xs mt-1">
              Connect dedicated hardware scanner kiosks to <code className="bg-slate-100 px-1 py-0.5 rounded">/ws/kiosk?device_code=KIOSK-01</code>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3 pl-4">Status</th>
                  <th className="p-3">Device Code</th>
                  <th className="p-3">Device Name</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">IP Address</th>
                  <th className="p-3 pr-4">Last Heartbeat (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {kiosks.map((k) => {
                  const isOnline = k.status === 'ONLINE'
                  return (
                    <tr key={k.deviceCode} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 pl-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isOnline
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                            }`}
                          ></span>
                          {k.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900">{k.deviceCode}</td>
                      <td className="p-3 font-medium">{k.deviceName}</td>
                      <td className="p-3 text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {k.location || 'Unassigned'}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-xs text-slate-500">
                        {k.ipAddress || '—'}
                      </td>
                      <td className="p-3 pr-4 text-xs text-slate-500">
                        {k.lastHeartbeatAtUtc
                          ? new Date(k.lastHeartbeatAtUtc).toLocaleString()
                          : 'Never'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
