import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { BarChart, LineChart, PieChart, Download, RefreshCw, Palette } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string;
    borderWidth?: number;
  }[];
}

export const ChartGenerator: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const [chartType, setChartType] = useState('bar');
  const [chartData, setChartData] = useState<ChartData>({
    labels: ['January', 'February', 'March', 'April', 'May', 'June'],
    datasets: [{
      label: 'Sample Data',
      data: [12, 19, 3, 5, 2, 3],
      backgroundColor: [
        'rgba(255, 99, 132, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 205, 86, 0.8)',
        'rgba(75, 192, 192, 0.8)',
        'rgba(153, 102, 255, 0.8)',
        'rgba(255, 159, 64, 0.8)'
      ],
      borderColor: 'rgba(54, 162, 235, 1)',
      borderWidth: 2
    }]
  });
  const [dataInput, setDataInput] = useState('12,19,3,5,2,3');
  const [labelsInput, setLabelsInput] = useState('January,February,March,April,May,June');
  const [chartTitle, setChartTitle] = useState('Sample Chart');
  const { toast } = useToast();

  const presetData = [
    {
      name: 'Sales Data',
      labels: 'Q1,Q2,Q3,Q4',
      data: '150,200,175,220',
      title: 'Quarterly Sales Performance'
    },
    {
      name: 'Website Traffic',
      labels: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',
      data: '1200,1500,1100,1800,2000,2200,1600',
      title: 'Weekly Website Traffic'
    },
    {
      name: 'Market Share',
      labels: 'Product A,Product B,Product C,Product D',
      data: '35,25,20,20',
      title: 'Market Share Distribution'
    },
    {
      name: 'Temperature',
      labels: 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec',
      data: '5,8,12,18,22,26,28,27,23,17,11,6',
      title: 'Average Monthly Temperature (°C)'
    }
  ];

  useEffect(() => {
    loadChart();
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, []);

  const loadChart = async () => {
    try {
      const Chart = (await import('chart.js/auto')).default;
      
      if (chartRef.current) {
        chartRef.current.destroy();
      }

      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          chartRef.current = new Chart(ctx, {
            type: chartType as any,
            data: chartData,
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                title: {
                  display: true,
                  text: chartTitle,
                  color: '#a855f7',
                  font: {
                    size: 16,
                    weight: 'bold'
                  }
                },
                legend: {
                  labels: {
                    color: '#e5e7eb'
                  }
                }
              },
              scales: chartType !== 'pie' && chartType !== 'doughnut' ? {
                x: {
                  ticks: {
                    color: '#9ca3af'
                  },
                  grid: {
                    color: 'rgba(156, 163, 175, 0.2)'
                  }
                },
                y: {
                  ticks: {
                    color: '#9ca3af'
                  },
                  grid: {
                    color: 'rgba(156, 163, 175, 0.2)'
                  }
                }
              } : {}
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to load Chart.js:', error);
      toast({
        title: 'Chart Error',
        description: 'Failed to load Chart.js library',
        variant: 'destructive'
      });
    }
  };

  const updateChart = () => {
    try {
      const labels = labelsInput.split(',').map(l => l.trim());
      const data = dataInput.split(',').map(d => parseFloat(d.trim())).filter(n => !isNaN(n));
      
      if (labels.length !== data.length) {
        toast({
          title: 'Data Mismatch',
          description: 'Number of labels must match number of data points',
          variant: 'destructive'
        });
        return;
      }

      const colors = [
        'rgba(255, 99, 132, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 205, 86, 0.8)',
        'rgba(75, 192, 192, 0.8)',
        'rgba(153, 102, 255, 0.8)',
        'rgba(255, 159, 64, 0.8)',
        'rgba(199, 199, 199, 0.8)',
        'rgba(83, 102, 255, 0.8)'
      ];

      const newChartData: ChartData = {
        labels,
        datasets: [{
          label: chartTitle,
          data,
          backgroundColor: chartType === 'pie' || chartType === 'doughnut' 
            ? colors.slice(0, data.length)
            : colors[1],
          borderColor: colors[1].replace('0.8', '1'),
          borderWidth: 2
        }]
      };

      setChartData(newChartData);
      
      if (chartRef.current) {
        chartRef.current.data = newChartData;
        chartRef.current.options.plugins.title.text = chartTitle;
        chartRef.current.update();
      }

      toast({
        title: 'Chart Updated',
        description: 'Chart has been updated with new data'
      });
    } catch (error) {
      toast({
        title: 'Update Error',
        description: 'Failed to update chart data',
        variant: 'destructive'
      });
    }
  };

  const changeChartType = (newType: string) => {
    setChartType(newType);
    setTimeout(() => {
      loadChart();
    }, 100);
  };

  const loadPreset = (preset: typeof presetData[0]) => {
    setLabelsInput(preset.labels);
    setDataInput(preset.data);
    setChartTitle(preset.title);
  };

  const downloadChart = () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.download = `${chartTitle.replace(/\s+/g, '_')}.png`;
      link.href = canvasRef.current.toDataURL();
      link.click();
      
      toast({
        title: 'Downloaded!',
        description: 'Chart image saved successfully'
      });
    }
  };

  const generateRandomData = () => {
    const labels = labelsInput.split(',').map(l => l.trim());
    const randomData = labels.map(() => Math.floor(Math.random() * 100) + 1);
    setDataInput(randomData.join(','));
  };

  const chartTypes = [
    { value: 'bar', label: 'Bar Chart', icon: BarChart },
    { value: 'line', label: 'Line Chart', icon: LineChart },
    { value: 'pie', label: 'Pie Chart', icon: PieChart },
    { value: 'doughnut', label: 'Doughnut', icon: PieChart },
    { value: 'radar', label: 'Radar', icon: BarChart },
    { value: 'polarArea', label: 'Polar Area', icon: PieChart }
  ];

  return (
    <div className="w-full space-y-4">
      <Card className="bg-gray-900/50 border-purple-500/30">
        <CardHeader>
          <CardTitle className="text-purple-400 flex items-center gap-2">
            <BarChart className="w-5 h-5" />
            Interactive Chart Generator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-gray-800/50">
              <TabsTrigger value="create">Create</TabsTrigger>
              <TabsTrigger value="presets">Presets</TabsTrigger>
              <TabsTrigger value="chart">Chart</TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="space-y-4">
              {/* Chart Type Selection */}
              <div>
                <label className="text-sm font-medium text-purple-400 mb-2 block">Chart Type</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {chartTypes.map((type) => (
                    <Button
                      key={type.value}
                      variant={chartType === type.value ? "default" : "outline"}
                      onClick={() => changeChartType(type.value)}
                      className={`${chartType === type.value 
                        ? 'bg-purple-600 hover:bg-purple-700' 
                        : 'border-purple-500/30 text-purple-400 hover:bg-purple-500/20'
                      } flex items-center gap-2`}
                    >
                      <type.icon className="w-4 h-4" />
                      {type.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Chart Title */}
              <div>
                <label className="text-sm font-medium text-purple-400 mb-2 block">Chart Title</label>
                <Input
                  value={chartTitle}
                  onChange={(e) => setChartTitle(e.target.value)}
                  placeholder="Enter chart title"
                  className="bg-gray-800 border-purple-500/30"
                />
              </div>

              {/* Labels */}
              <div>
                <label className="text-sm font-medium text-purple-400 mb-2 block">Labels (comma-separated)</label>
                <Input
                  value={labelsInput}
                  onChange={(e) => setLabelsInput(e.target.value)}
                  placeholder="Label1,Label2,Label3"
                  className="bg-gray-800 border-purple-500/30"
                />
              </div>

              {/* Data */}
              <div>
                <label className="text-sm font-medium text-purple-400 mb-2 block">Data (comma-separated numbers)</label>
                <div className="flex gap-2">
                  <Input
                    value={dataInput}
                    onChange={(e) => setDataInput(e.target.value)}
                    placeholder="10,20,30,40"
                    className="flex-1 bg-gray-800 border-purple-500/30"
                  />
                  <Button
                    onClick={generateRandomData}
                    variant="outline"
                    className="border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Update Button */}
              <Button
                onClick={updateChart}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                Update Chart
              </Button>
            </TabsContent>

            <TabsContent value="presets" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {presetData.map((preset, index) => (
                  <Card key={index} className="bg-gray-800/50 border-purple-500/20 hover:border-purple-400/50 transition-colors cursor-pointer"
                        onClick={() => loadPreset(preset)}>
                    <CardContent className="p-4">
                      <h4 className="font-medium text-white mb-2">{preset.name}</h4>
                      <p className="text-sm text-gray-400 mb-2">{preset.title}</p>
                      <div className="flex gap-2">
                        <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                          {preset.labels.split(',').length} points
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="chart" className="space-y-4">
              {/* Chart Display */}
              <div className="relative bg-gray-800/30 p-4 rounded-lg border border-purple-500/30">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-white">{chartTitle}</h3>
                  <Button
                    onClick={downloadChart}
                    variant="outline"
                    size="sm"
                    className="border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download PNG
                  </Button>
                </div>
                <div style={{ height: '400px' }}>
                  <canvas ref={canvasRef} />
                </div>
              </div>

              {/* Chart Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800/30 p-3 rounded-lg border border-purple-500/20">
                  <div className="text-sm text-gray-400">Type</div>
                  <div className="text-white font-medium capitalize">{chartType}</div>
                </div>
                <div className="bg-gray-800/30 p-3 rounded-lg border border-purple-500/20">
                  <div className="text-sm text-gray-400">Data Points</div>
                  <div className="text-white font-medium">{chartData.labels.length}</div>
                </div>
                <div className="bg-gray-800/30 p-3 rounded-lg border border-purple-500/20">
                  <div className="text-sm text-gray-400">Max Value</div>
                  <div className="text-white font-medium">{Math.max(...chartData.datasets[0].data)}</div>
                </div>
                <div className="bg-gray-800/30 p-3 rounded-lg border border-purple-500/20">
                  <div className="text-sm text-gray-400">Min Value</div>
                  <div className="text-white font-medium">{Math.min(...chartData.datasets[0].data)}</div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChartGenerator;

