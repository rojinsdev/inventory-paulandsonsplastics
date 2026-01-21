'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    Container,
    Grid,
    Paper,
    Typography,
    Card,
    CardContent,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Button,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Alert,
    CircularProgress,
} from '@mui/material';
import { PieChart } from '@mui/x-charts/PieChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { BarChart } from '@mui/x-charts/BarChart';
import {
    TrendingDown,
    Scale,
    Clock,
    TrendingUp,
    AlertTriangle,
    Activity,
} from 'lucide-react';

export default function AnalyticsPage() {
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState({
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
    });

    // State for all analytics data
    const [summary, setSummary] = useState(null);
    const [cycleTimeLoss, setCycleTimeLoss] = useState(null);
    const [weightWastage, setWeightWastage] = useState(null);
    const [downtimeBreakdown, setDowntimeBreakdown] = useState(null);
    const [machineEfficiency, setMachineEfficiency] = useState(null);
    const [shiftComparison, setShiftComparison] = useState(null);

    useEffect(() => {
        fetchAllAnalytics();
    }, [dateRange]);

    const fetchAllAnalytics = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            const params = new URLSearchParams({
                start_date: dateRange.start,
                end_date: dateRange.end,
            });

            const [summaryRes, cycleRes, weightRes, downtimeRes, efficiencyRes, shiftRes] =
                await Promise.all([
                    fetch(`http://localhost:4000/api/analytics/summary?${params}`, { headers }),
                    fetch(`http://localhost:4000/api/analytics/cycle-time-loss?${params}`, { headers }),
                    fetch(`http://localhost:4000/api/analytics/weight-wastage?${params}`, { headers }),
                    fetch(`http://localhost:4000/api/analytics/downtime-breakdown?${params}`, { headers }),
                    fetch(`http://localhost:4000/api/analytics/machine-efficiency?${params}`, { headers }),
                    fetch(`http://localhost:4000/api/analytics/shift-comparison?${params}`, { headers }),
                ]);

            setSummary(await summaryRes.json());
            setCycleTimeLoss(await cycleRes.json());
            setWeightWastage(await weightRes.json());
            setDowntimeBreakdown(await downtimeRes.json());
            setMachineEfficiency(await efficiencyRes.json());
            setShiftComparison(await shiftRes.json());
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
                <CircularProgress size={60} />
            </Box>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            {/* Header */}
            <Box mb={4}>
                <Typography variant="h4" fontWeight="bold" gutterBottom>
                    Production Analytics
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Detailed insights into cycle time losses, material wastage, and downtime
                </Typography>
            </Box>

            {/* Date Range Filter */}
            <Paper sx={{ p: 3, mb: 4 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth
                            label="Start Date"
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth
                            label="End Date"
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Button
                            fullWidth
                            variant="contained"
                            onClick={fetchAllAnalytics}
                            sx={{ height: 56 }}
                        >
                            Apply Filter
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            {/* Summary Cards */}
            <Grid container spacing={3} mb={4}>
                <Grid item xs={12} sm={6} md={4}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={2}>
                                <TrendingDown size={40} color="#f44336" />
                                <Box>
                                    <Typography variant="h4" fontWeight="bold">
                                        {summary?.total_units_lost_to_cycle?.toLocaleString() || 0}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Units Lost (Cycle Time)
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={4}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Scale size={40} color="#ff9800" />
                                <Box>
                                    <Typography variant="h4" fontWeight="bold">
                                        {summary?.total_weight_wastage_kg?.toFixed(2) || 0} kg
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Material Wastage
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={4}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Clock size={40} color="#2196f3" />
                                <Box>
                                    <Typography variant="h4" fontWeight="bold">
                                        {Math.floor((summary?.total_downtime_minutes || 0) / 60)}h{' '}
                                        {(summary?.total_downtime_minutes || 0) % 60}m
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Total Downtime
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={4}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Activity size={40} color="#4caf50" />
                                <Box>
                                    <Typography variant="h4" fontWeight="bold">
                                        {summary?.total_production?.toLocaleString() || 0}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Total Production
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={4}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={2}>
                                <AlertTriangle size={40} color="#ff5722" />
                                <Box>
                                    <Typography variant="h4" fontWeight="bold">
                                        {summary?.flagged_sessions || 0}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Flagged Sessions (5%+)
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={4}>
                    <Card>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={2}>
                                <TrendingUp size={40} color="#9c27b0" />
                                <Box>
                                    <Typography variant="h4" fontWeight="bold">
                                        {summary?.total_sessions || 0}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Total Sessions
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Downtime Breakdown - Pie Chart */}
            <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Downtime Breakdown by Reason
                </Typography>
                {downtimeBreakdown?.breakdown?.length > 0 ? (
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <PieChart
                                series={[
                                    {
                                        data: downtimeBreakdown.breakdown.map((item, index) => ({
                                            id: index,
                                            value: item.total_minutes,
                                            label: item.reason,
                                        })),
                                        highlightScope: { faded: 'global', highlighted: 'item' },
                                    },
                                ]}
                                height={300}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell><strong>Reason</strong></TableCell>
                                            <TableCell align="right"><strong>Minutes</strong></TableCell>
                                            <TableCell align="right"><strong>Occurrences</strong></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {downtimeBreakdown.breakdown.map((item, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{item.reason}</TableCell>
                                                <TableCell align="right">{item.total_minutes}</TableCell>
                                                <TableCell align="right">{item.occurrences}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Grid>
                    </Grid>
                ) : (
                    <Alert severity="info">No downtime data available for this period</Alert>
                )}
            </Paper>

            {/* Shift Comparison - Bar Chart */}
            <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Shift Performance Comparison
                </Typography>
                {shiftComparison && (
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <BarChart
                                xAxis={[{ scaleType: 'band', data: ['Shift 1 (Day)', 'Shift 2 (Night)'] }]}
                                series={[
                                    {
                                        label: 'Avg Efficiency (%)',
                                        data: [
                                            shiftComparison.shift_1?.avg_efficiency || 0,
                                            shiftComparison.shift_2?.avg_efficiency || 0,
                                        ],
                                    },
                                ]}
                                height={300}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell><strong>Metric</strong></TableCell>
                                            <TableCell align="right"><strong>Shift 1</strong></TableCell>
                                            <TableCell align="right"><strong>Shift 2</strong></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell>Sessions</TableCell>
                                            <TableCell align="right">{shiftComparison.shift_1?.sessions || 0}</TableCell>
                                            <TableCell align="right">{shiftComparison.shift_2?.sessions || 0}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Avg Efficiency</TableCell>
                                            <TableCell align="right">{shiftComparison.shift_1?.avg_efficiency || 0}%</TableCell>
                                            <TableCell align="right">{shiftComparison.shift_2?.avg_efficiency || 0}%</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Total Production</TableCell>
                                            <TableCell align="right">{shiftComparison.shift_1?.total_production?.toLocaleString() || 0}</TableCell>
                                            <TableCell align="right">{shiftComparison.shift_2?.total_production?.toLocaleString() || 0}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Units Lost</TableCell>
                                            <TableCell align="right">{shiftComparison.shift_1?.total_units_lost?.toLocaleString() || 0}</TableCell>
                                            <TableCell align="right">{shiftComparison.shift_2?.total_units_lost?.toLocaleString() || 0}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Downtime (mins)</TableCell>
                                            <TableCell align="right">{shiftComparison.shift_1?.total_downtime_minutes || 0}</TableCell>
                                            <TableCell align="right">{shiftComparison.shift_2?.total_downtime_minutes || 0}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Grid>
                    </Grid>
                )}
            </Paper>

            {/* Machine Efficiency Trends - Line Chart */}
            <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Machine Efficiency Trends
                </Typography>
                {machineEfficiency?.machines?.length > 0 ? (
                    <Box>
                        {machineEfficiency.machines.map((machine) => (
                            <Box key={machine.machine_id} mb={4}>
                                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                    {machine.machine_name} - Avg: {machine.avg_efficiency}%
                                </Typography>
                                <LineChart
                                    xAxis={[
                                        {
                                            scaleType: 'point',
                                            data: machine.data_points.map(
                                                (dp) => `${dp.date} S${dp.shift}`
                                            ),
                                        },
                                    ]}
                                    series={[
                                        {
                                            label: 'Efficiency %',
                                            data: machine.data_points.map((dp) => dp.efficiency),
                                            color: '#2196f3',
                                        },
                                    ]}
                                    height={250}
                                />
                            </Box>
                        ))}
                    </Box>
                ) : (
                    <Alert severity="info">No machine efficiency data available</Alert>
                )}
            </Paper>

            {/* Cycle Time Loss - Top Sessions */}
            <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Top Cycle Time Loss Sessions
                </Typography>
                {cycleTimeLoss?.sessions?.length > 0 ? (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell><strong>Date</strong></TableCell>
                                    <TableCell><strong>Shift</strong></TableCell>
                                    <TableCell><strong>Machine</strong></TableCell>
                                    <TableCell><strong>Product</strong></TableCell>
                                    <TableCell align="right"><strong>Units Lost</strong></TableCell>
                                    <TableCell align="right"><strong>Actual Cycle Time</strong></TableCell>
                                    <TableCell><strong>Status</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {cycleTimeLoss.sessions.slice(0, 10).map((session) => (
                                    <TableRow key={session.id}>
                                        <TableCell>{session.date}</TableCell>
                                        <TableCell>Shift {session.shift_number}</TableCell>
                                        <TableCell>{session.machines?.name}</TableCell>
                                        <TableCell>
                                            {session.products?.name} ({session.products?.size} - {session.products?.color})
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip
                                                label={session.units_lost_to_cycle}
                                                color="error"
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="right">{session.actual_cycle_time_seconds}s</TableCell>
                                        <TableCell>
                                            {session.flagged_for_review && (
                                                <Chip label="Flagged" color="warning" size="small" />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                ) : (
                    <Alert severity="success">No significant cycle time losses detected!</Alert>
                )}
            </Paper>

            {/* Weight Wastage - Top Sessions */}
            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Top Weight Wastage Sessions
                </Typography>
                {weightWastage?.sessions?.length > 0 ? (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell><strong>Date</strong></TableCell>
                                    <TableCell><strong>Shift</strong></TableCell>
                                    <TableCell><strong>Machine</strong></TableCell>
                                    <TableCell><strong>Product</strong></TableCell>
                                    <TableCell align="right"><strong>Wastage (kg)</strong></TableCell>
                                    <TableCell align="right"><strong>Actual Weight</strong></TableCell>
                                    <TableCell align="right"><strong>Ideal Weight</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {weightWastage.sessions.slice(0, 10).map((session) => (
                                    <TableRow key={session.id}>
                                        <TableCell>{session.date}</TableCell>
                                        <TableCell>Shift {session.shift_number}</TableCell>
                                        <TableCell>{session.machines?.name}</TableCell>
                                        <TableCell>
                                            {session.products?.name} ({session.products?.size} - {session.products?.color})
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip
                                                label={`${session.weight_wastage_kg?.toFixed(2)} kg`}
                                                color="warning"
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="right">{session.actual_weight_grams}g</TableCell>
                                        <TableCell align="right">{session.products?.weight_grams}g</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                ) : (
                    <Alert severity="success">No significant weight wastage detected!</Alert>
                )}
            </Paper>
        </Container>
    );
}
